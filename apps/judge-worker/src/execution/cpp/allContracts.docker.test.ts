import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CPP_CONTRACT_REGISTRY, CANONICAL_75_SLUGS, validateCppRegistry } from "@codearena/shared";
import { evaluateSubmission } from "../evaluate.js";
import { isDockerAvailable } from "../dockerAvailable.js";
import { REFERENCE_IMPLEMENTATIONS } from "./referenceSolutions.js";
import { buildReferenceSubmission } from "./buildReferenceSubmission.js";

/**
 * Verifies every one of the 75 C++ contracts end-to-end against real stored
 * problem data: take the actual rendered starter template, fill in a known-
 * correct body, generate the harness, compile it inside the real judge
 * Docker image, and run it against a stored sample row and a stored hidden
 * row. Deliberately reads from codearena_restored (read-only) rather than
 * the dedicated codearena_test database, since that is where the real
 * catalog and its stored test rows live — this suite never writes to it.
 *
 * codearena_restored is a local development fixture, not something CI (or
 * any other environment) is expected to have — CI's dedicated codearena_test
 * database is deliberately kept schema-only so other suites can rely on a
 * clean slate. So this suite is gated on the catalog actually being reachable
 * and fully seeded, exactly like describeIfDocker already gates on Docker
 * being available: skip gracefully rather than fail when the fixture this
 * suite depends on simply isn't present.
 */
const RESTORED_DB_URL = "postgresql://codearena:codearena@localhost:5433/codearena_restored";

async function restoredCatalogAvailable(): Promise<boolean> {
  const prisma = new PrismaClient({ datasources: { db: { url: RESTORED_DB_URL } } });
  try {
    const count = await prisma.problem.count({
      where: { slug: { in: [...CANONICAL_75_SLUGS] } },
    });
    return count === CANONICAL_75_SLUGS.length;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const describeIfDocker =
  isDockerAvailable() && (await restoredCatalogAvailable()) ? describe : describe.skip;

interface FixtureRow {
  input: string;
  expectedOutput: string;
}

describeIfDocker("C++ contract registry — real Docker compile/run for all 75", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: RESTORED_DB_URL } } });
  const fixturesBySlug = new Map<string, { sample: FixtureRow; hidden: FixtureRow }>();

  beforeAll(async () => {
    const problems = await prisma.problem.findMany({
      where: { slug: { in: [...CANONICAL_75_SLUGS] } },
      select: { id: true, slug: true },
    });
    expect(problems.length, "all 75 canonical slugs must exist in codearena_restored").toBe(75);

    for (const problem of problems) {
      const [sample] = await prisma.testCase.findMany({
        where: { problemId: problem.id, isSample: true },
        select: { input: true, expectedOutput: true },
        take: 1,
      });
      const [hidden] = await prisma.testCase.findMany({
        where: { problemId: problem.id, isSample: false },
        select: { input: true, expectedOutput: true },
        take: 1,
      });
      if (sample && hidden) {
        fixturesBySlug.set(problem.slug, { sample, hidden });
      }
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registry validates cleanly before running any contract", () => {
    const result = validateCppRegistry();
    expect(result.errors).toEqual([]);
  });

  for (const slug of CANONICAL_75_SLUGS) {
    it(`${slug}: real class-only C++ solution compiles, runs, and matches stored sample + hidden output`, async () => {
      const fixtures = fixturesBySlug.get(slug);
      expect(fixtures, `${slug} must have both a sample and a hidden stored row`).toBeDefined();
      if (!fixtures) return;

      const contract = CPP_CONTRACT_REGISTRY[slug];
      const impl = REFERENCE_IMPLEMENTATIONS[slug];
      const source = buildReferenceSubmission(contract, impl);

      const result = await evaluateSubmission({
        submissionId: `cpp-contract-${slug}-${randomUUID()}`,
        problemSlug: slug,
        language: "CPP",
        sourceCode: source,
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        testCases: [
          {
            id: `${slug}-sample`,
            input: fixtures.sample.input,
            expectedOutput: fixtures.sample.expectedOutput,
          },
          {
            id: `${slug}-hidden`,
            input: fixtures.hidden.input,
            expectedOutput: fixtures.hidden.expectedOutput,
          },
        ],
      });

      expect(result.verdict, `${slug}: ${result.compilerOutput ?? ""}`).toBe("ACCEPTED");
      expect(result.testResults).toHaveLength(2);
      expect(
        result.testResults.every((t) => t.passed),
        slug,
      ).toBe(true);
    }, 120_000);
  }
});
