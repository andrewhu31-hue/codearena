// Creates a load-test contest from the existing seeded catalog (e.g., Blind 75)
// and pre-registers simulated users. It does not create or delete catalog
// problems, so it is safe to run against the seeded dataset.
//
// Usage:
//   JWT_ACCESS_SECRET=... DATABASE_URL=... node setup/prepare-leetcode-contest.mjs [userCount]
//
// Output:
//   load-tests/results/leetcode-context.json
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "@codearena/database";

const USER_COUNT = Number(process.argv[2] || process.env.LOAD_TEST_USERS || 100);
const CONTEST_HOURS = Number(process.env.LOAD_TEST_CONTEST_HOURS || 4);
const CONTEST_NAME = process.env.LOAD_TEST_CONTEST_NAME || "LeetCode-Style Blind 75 Simulation";
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is required (must match the running API's secret)");
}
if (!Number.isFinite(USER_COUNT) || USER_COUNT <= 0) {
  throw new Error(`Invalid user count: ${USER_COUNT}`);
}

const outPath = fileURLToPath(new URL("../results/leetcode-context.json", import.meta.url));

function pointsForDifficulty(difficulty) {
  if (difficulty === "HARD") return 300;
  if (difficulty === "MEDIUM") return 200;
  return 100;
}

async function main() {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("LoadTest123!Load", 4);

  const catalogProblems = await prisma.problem.findMany({
    where: { slug: { not: { startsWith: "load-test-" } } },
    orderBy: [{ difficulty: "asc" }, { title: "asc" }],
    select: { id: true, slug: true, title: true, difficulty: true },
  });

  if (catalogProblems.length === 0) {
    throw new Error("No catalog problems found. Seed the database first.");
  }

  const users = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const user = await prisma.user.create({
      data: {
        email: `loadtest-leetcode-${stamp}-${i}@example.com`,
        username: `ltleetcode${stamp}${i}`,
        passwordHash,
      },
    });
    const token = jwt.sign({ sub: user.id, role: "CONTESTANT" }, JWT_ACCESS_SECRET, {
      expiresIn: "4h",
    });
    users.push({ userId: user.id, token });
  }

  const startTime = new Date(Date.now() - 5 * 60 * 1000);
  const endTime = new Date(Date.now() + CONTEST_HOURS * 60 * 60 * 1000);

  const contest = await prisma.contest.create({
    data: {
      name: `${CONTEST_NAME} ${stamp}`,
      description:
        "LeetCode-style long-form contest over the seeded catalog, used for 100-user load simulation.",
      startTime,
      endTime,
      visibility: "PUBLIC",
      contestProblems: {
        create: catalogProblems.map((problem, index) => ({
          problemId: problem.id,
          points: pointsForDifficulty(problem.difficulty),
          order: index,
        })),
      },
    },
  });

  await prisma.contestRegistration.createMany({
    data: users.map((u) => ({ contestId: contest.id, userId: u.userId })),
  });

  const context = {
    contestId: contest.id,
    contestName: contest.name,
    problemCount: catalogProblems.length,
    problemIds: catalogProblems.map((p) => p.id),
    problemSlugs: catalogProblems.map((p) => p.slug),
    problemId: catalogProblems[0].id,
    users,
  };

  writeFileSync(outPath, JSON.stringify(context, null, 2));
  console.log(
    `Prepared ${users.length} users and contest ${contest.id} with ${catalogProblems.length} catalog problems`,
  );
  console.log(`Contest name: ${contest.name}`);
  console.log(`Wrote ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
