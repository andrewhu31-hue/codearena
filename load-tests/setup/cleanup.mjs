// Removes everything setup/prepare.mjs created, so repeated load-test runs
// don't accumulate throwaway data in a real database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertLoadTestDatabase, prisma } from "@codearena/database";

const contextPath = fileURLToPath(new URL("../results/context.json", import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
assertLoadTestDatabase(DATABASE_URL, "load-tests setup/cleanup.mjs");

async function main() {
  const context = JSON.parse(readFileSync(contextPath, "utf8"));
  const userIds = context.users.map((u) => u.userId);

  await prisma.contestScore.deleteMany({ where: { contestId: context.contestId } });
  await prisma.contestRegistration.deleteMany({ where: { contestId: context.contestId } });
  await prisma.contestProblem.deleteMany({ where: { contestId: context.contestId } });
  await prisma.submissionResult.deleteMany({
    where: { submission: { problemId: context.problemId } },
  });
  await prisma.submission.deleteMany({ where: { problemId: context.problemId } });
  await prisma.contest.delete({ where: { id: context.contestId } });
  await prisma.testCase.deleteMany({ where: { problemId: context.problemId } });
  await prisma.problem.delete({ where: { id: context.problemId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`Cleaned up ${userIds.length} load-test users, 1 problem, 1 contest`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
