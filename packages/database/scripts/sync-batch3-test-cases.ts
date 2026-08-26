import { PrismaClient } from "@prisma/client";
import {
  BATCH3_SLUGS,
  computeBatch3AdditionalTests,
  computeBatch3ExpectedOutput,
} from "../src/problemOraclesBatch3.js";

function parseDatabaseName(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, "");
}

function keyFor(input: string, expectedOutput: string): string {
  return `${input}|||${expectedOutput}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const dbName = parseDatabaseName(databaseUrl);
  if (dbName !== "codearena_restored") {
    throw new Error(`Refusing to run: DATABASE_URL must target codearena_restored (got ${dbName})`);
  }

  const prisma = new PrismaClient();

  try {
    const targetSlugs = [...BATCH3_SLUGS];
    const problems = await prisma.problem.findMany({
      where: { slug: { in: targetSlugs } },
      select: { id: true, slug: true },
    });

    const missing = targetSlugs.filter((slug) => !problems.some((p) => p.slug === slug));
    if (missing.length > 0) {
      throw new Error(`Missing target slugs in database: ${missing.join(", ")}`);
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          database: dbName,
          targetSlugs,
          scope: "Only test_cases rows for listed slugs may be inserted; no deletes or updates.",
        },
        null,
        2,
      ),
    );

    const perProblem: Array<{
      slug: string;
      beforeTotal: number;
      beforeUnique: number;
      additions: number;
      afterUnique: number;
      conflicts: number;
      meetsFloor: boolean;
    }> = [];

    const inserts: Array<{
      problemId: string;
      input: string;
      expectedOutput: string;
      isSample: boolean;
    }> = [];

    for (const problem of problems.sort((a, b) => a.slug.localeCompare(b.slug))) {
      const rows = await prisma.testCase.findMany({
        where: { problemId: problem.id },
        select: { input: true, expectedOutput: true },
      });

      const outputsByInput = new Map<string, Set<string>>();
      for (const row of rows) {
        const set = outputsByInput.get(row.input) ?? new Set<string>();
        set.add(row.expectedOutput);
        outputsByInput.set(row.input, set);
      }

      const conflicts = [...outputsByInput.values()].filter((s) => s.size > 1).length;
      if (conflicts > 0) {
        throw new Error(
          `Stopping on ${problem.slug}: found ${conflicts} conflicting expected outputs`,
        );
      }

      const uniqueExisting = new Map<string, { input: string; expectedOutput: string }>();
      for (const row of rows) {
        uniqueExisting.set(keyFor(row.input, row.expectedOutput), row);
      }

      // Oracle must agree with every existing unique pair before adding new cases.
      for (const pair of uniqueExisting.values()) {
        let oracle: string;
        try {
          oracle = computeBatch3ExpectedOutput(problem.slug, pair.input);
        } catch (err) {
          throw new Error(
            [
              `Stopping on ${problem.slug}: oracle rejected an existing stored input`,
              `input=${JSON.stringify(pair.input)}`,
              `error=${err instanceof Error ? err.message : String(err)}`,
            ].join(" | "),
          );
        }
        if (oracle !== pair.expectedOutput) {
          throw new Error(
            [
              `Stopping on ${problem.slug}: oracle disagreement`,
              `input=${JSON.stringify(pair.input)}`,
              `expected(existing)=${JSON.stringify(pair.expectedOutput)}`,
              `expected(oracle)=${JSON.stringify(oracle)}`,
            ].join(" | "),
          );
        }
      }

      const additionsForSlug = computeBatch3AdditionalTests(problem.slug);
      const dedupedAdditions = new Map<string, { input: string; expectedOutput: string }>();
      for (const c of additionsForSlug) {
        dedupedAdditions.set(keyFor(c.input, c.expectedOutput), c);
      }

      let additions = 0;
      for (const c of dedupedAdditions.values()) {
        const key = keyFor(c.input, c.expectedOutput);
        if (uniqueExisting.has(key)) continue;
        inserts.push({
          problemId: problem.id,
          input: c.input,
          expectedOutput: c.expectedOutput,
          isSample: false,
        });
        uniqueExisting.set(key, c);
        additions += 1;
      }

      perProblem.push({
        slug: problem.slug,
        beforeTotal: rows.length,
        beforeUnique: new Set(rows.map((r) => keyFor(r.input, r.expectedOutput))).size,
        additions,
        afterUnique: uniqueExisting.size,
        conflicts,
        meetsFloor: uniqueExisting.size >= 7,
      });
    }

    const belowFloor = perProblem.filter((p) => !p.meetsFloor);
    if (belowFloor.length > 0) {
      throw new Error(
        `Stopping: ${belowFloor.map((p) => `${p.slug} (${p.afterUnique})`).join(", ")} would remain below the 7-unique-pair floor`,
      );
    }

    const summary = {
      mode: apply ? "apply" : "dry-run",
      database: dbName,
      totalProblems: perProblem.length,
      totalInsertionsPlanned: inserts.length,
      perProblem,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (!apply) {
      console.log("Dry-run only. Re-run with --apply to insert planned rows.");
      return;
    }

    if (inserts.length === 0) {
      console.log("No insertions needed; database already synchronized for batch 3.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.testCase.createMany({ data: inserts });
    });

    console.log(JSON.stringify({ appliedInsertions: inserts.length, database: dbName }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
