// Seeds throwaway users, a problem, and an active contest directly via
// Prisma, and mints access tokens with the API's own JWT secret instead of
// going through POST /auth/register or /auth/login.
//
// This is a deliberate methodological choice, not a shortcut: register is
// capped at 5/hour/IP and login at 10/15min/IP (apps/api/src/routes/
// auth.routes.ts), and a k6 run driving hundreds of iterations from one
// test-runner IP would immediately be dominated by those limits rather
// than exercising the endpoints actually under test. Minting a token here
// does exactly what a successful login does internally — it doesn't grant
// any access a real login couldn't — it just skips the rate-limited HTTP
// round trip for load-test setup, which is a separate concern with its
// own (intentionally strict) test coverage in apps/api/src/auth.test.ts.
//
// Usage: JWT_ACCESS_SECRET=... DATABASE_URL=... node setup/prepare.mjs [userCount]
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { assertLoadTestDatabase, prisma } from "@codearena/database";

const USER_COUNT = Number(process.argv[2] || process.env.LOAD_TEST_USERS || 100);
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
if (!JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is required (must match the running API's secret)");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
assertLoadTestDatabase(DATABASE_URL, "load-tests setup/prepare.mjs");

const outPath = fileURLToPath(new URL("../results/context.json", import.meta.url));

async function main() {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("LoadTest123!Load", 4);

  const users = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const user = await prisma.user.create({
      data: {
        email: `loadtest-${stamp}-${i}@example.com`,
        username: `loadtest${stamp}${i}`,
        passwordHash,
      },
    });
    const token = jwt.sign({ sub: user.id, role: "CONTESTANT" }, JWT_ACCESS_SECRET, {
      expiresIn: "2h",
    });
    users.push({ userId: user.id, token });
  }

  const problem = await prisma.problem.create({
    data: {
      slug: `load-test-echo-${stamp}`,
      title: "Load Test Echo",
      description: "Echoes its input. Used only by load-tests/, not shown in the real catalog.",
      supportedLanguages: ["PYTHON"],
      timeLimitMs: 5000,
      testCases: {
        create: [
          { input: "hi", expectedOutput: "hi", isSample: true },
          { input: "line-2", expectedOutput: "line-2", isSample: false },
          { input: "symbols-123", expectedOutput: "symbols-123", isSample: false },
        ],
      },
    },
  });

  const contest = await prisma.contest.create({
    data: {
      name: `Load Test Contest ${stamp}`,
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
      visibility: "PUBLIC",
      contestProblems: { create: [{ problemId: problem.id, points: 100 }] },
    },
  });

  // Registering hundreds of users for the contest-spike scenario one at a
  // time would itself dominate the run; batch it here as setup, not load.
  await prisma.contestRegistration.createMany({
    data: users.map((u) => ({ contestId: contest.id, userId: u.userId })),
  });

  const context = {
    runTag: `competition-context-${stamp}`,
    problemId: problem.id,
    problemSlug: problem.slug,
    contestId: contest.id,
    users,
  };
  writeFileSync(outPath, JSON.stringify(context, null, 2));
  console.log(`Prepared ${users.length} users, problem ${problem.slug}, contest ${contest.id}`);
  console.log(`Wrote ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
