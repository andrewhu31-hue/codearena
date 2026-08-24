import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { assertDedicatedTestDatabase, prisma } from "@codearena/database";
import { loadJudgeWorkerEnv } from "@codearena/config";
import { SUBMISSION_QUEUE_NAME } from "@codearena/shared";
import { createSubmissionWorker, type SubmissionWorkerHandle } from "./worker.js";
import { isDockerAvailable } from "./execution/dockerAvailable.js";

/**
 * Deterministic lifecycle test (PRD §16): create a user, a problem, and a
 * QUEUED submission directly in Postgres (standing in for what the API's
 * `POST /submissions` does), enqueue the same job the API would enqueue,
 * and confirm the real BullMQ worker in this app carries it all the way to
 * a persisted verdict, via a real Docker execution. Needs a real Postgres +
 * Redis (like `apps/api/src/auth.test.ts`) *and* a real Docker daemon;
 * skipped automatically when either isn't available. Per-language and
 * per-verdict coverage (compile errors, timeouts, ...) lives in
 * `execution/evaluate.docker.test.ts`, which doesn't need Postgres — this
 * file is about the queue/worker/persistence wiring around evaluation, not
 * evaluation itself.
 */
const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const canRun = hasTestInfra && isDockerAvailable();
const describeIfReady = canRun ? describe : describe.skip;

function assertSafeCleanupTarget() {
  assertDedicatedTestDatabase(process.env.DATABASE_URL ?? "", "Judge worker lifecycle test cleanup");
}

async function waitForTerminalStatus(submissionId: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (; ;) {
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });
    if (submission.status === "COMPLETED" || submission.status === "FAILED") return submission;
    if (Date.now() > deadline) throw new Error("Timed out waiting for submission to finish");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function waitForContestScore(contestId: string, userId: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (; ;) {
    const score = await prisma.contestScore.findUnique({
      where: { contestId_userId: { contestId, userId } },
    });
    if (score) return score;
    if (Date.now() > deadline) throw new Error("Timed out waiting for contest score");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function seedEchoProblem() {
  // A trivial "print exactly what you're given" problem: any correct
  // solution echoes stdin to stdout, so verdicts here reflect real output
  // comparison, not a mock.
  const problem = await prisma.problem.create({
    data: {
      slug: `lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "Lifecycle Test Problem",
      supportedLanguages: ["PYTHON"],
      testCases: {
        create: [
          { input: "one", expectedOutput: "one", isSample: true },
          { input: "two", expectedOutput: "two", isSample: false },
        ],
      },
    },
    include: { testCases: true },
  });

  const user = await prisma.user.create({
    data: {
      email: `lifecycle-${Date.now()}@example.com`,
      username: `lifecycle${Date.now()}`,
      passwordHash: "not-a-real-hash",
    },
  });

  return { problem, user };
}

describeIfReady("submission lifecycle", () => {
  let queue: Queue;
  let queueConnection: Redis;
  let workerHandle: SubmissionWorkerHandle;

  beforeAll(() => {
    const env = loadJudgeWorkerEnv();
    queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(SUBMISSION_QUEUE_NAME, { connection: queueConnection });
    workerHandle = createSubmissionWorker(env);
  });

  afterEach(async () => {
    assertSafeCleanupTarget();
    await prisma.contestScore.deleteMany();
    await prisma.contestRegistration.deleteMany();
    await prisma.contestProblem.deleteMany();
    await prisma.submissionResult.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.contest.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await queue.close();
    await queueConnection.quit();
    await workerHandle.worker.close();
    await Promise.allSettled([workerHandle.connection.quit(), workerHandle.redisClient.quit()]);
    await prisma.$disconnect();
  });

  it("judges a correct solution as ACCEPTED via a real Docker execution", async () => {
    const { problem, user } = await seedEchoProblem();

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "import sys\nsys.stdout.write(sys.stdin.read())\n",
        testsTotal: problem.testCases.length,
      },
    });

    await queue.add(
      "evaluate",
      { submissionId: submission.id },
      { jobId: submission.id, attempts: 1 },
    );

    const finished = await waitForTerminalStatus(submission.id);
    expect(finished.status).toBe("COMPLETED");
    expect(finished.verdict).toBe("ACCEPTED");
    expect(finished.testsPassed).toBe(problem.testCases.length);
    expect(finished.testsTotal).toBe(problem.testCases.length);
    expect(finished.runtimeMs).not.toBeNull();

    const results = await prisma.submissionResult.findMany({
      where: { submissionId: submission.id },
    });
    expect(results).toHaveLength(problem.testCases.length);
    expect(results.every((r) => r.passed)).toBe(true);
  }, 60_000);

  it("judges an incorrect solution as WRONG_ANSWER and stops at the first failing test", async () => {
    const { problem, user } = await seedEchoProblem();

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print('nope')\n",
        testsTotal: problem.testCases.length,
      },
    });

    await queue.add(
      "evaluate",
      { submissionId: submission.id },
      { jobId: submission.id, attempts: 1 },
    );

    const finished = await waitForTerminalStatus(submission.id);
    expect(finished.status).toBe("COMPLETED");
    expect(finished.verdict).toBe("WRONG_ANSWER");
    expect(finished.testsPassed).toBe(0);
    expect(finished.testsTotal).toBe(problem.testCases.length);

    // Stopped after the first (failing) test, not both.
    const results = await prisma.submissionResult.findMany({
      where: { submissionId: submission.id },
    });
    expect(results).toHaveLength(1);
  }, 60_000);

  it("does not reprocess a submission that already reached a terminal state", async () => {
    const { problem, user } = await seedEchoProblem();

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print('ok')",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        testsPassed: problem.testCases.length,
        testsTotal: problem.testCases.length,
      },
    });

    await queue.add(
      "evaluate",
      { submissionId: submission.id },
      { jobId: submission.id, attempts: 1 },
    );

    // No new results should ever be written for an already-terminal submission.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const results = await prisma.submissionResult.findMany({
      where: { submissionId: submission.id },
    });
    expect(results).toHaveLength(0);
  });

  it("updates the contest score and leaderboard cache after judging a contest submission", async () => {
    const { problem, user } = await seedEchoProblem();
    const contest = await prisma.contest.create({
      data: {
        name: "Live Contest",
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId: problem.id, points: 150 }] },
      },
    });
    await prisma.contestRegistration.create({ data: { contestId: contest.id, userId: user.id } });

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        contestId: contest.id,
        language: "PYTHON",
        sourceCode: "import sys\nsys.stdout.write(sys.stdin.read())\n",
        testsTotal: problem.testCases.length,
      },
    });

    await queue.add(
      "evaluate",
      { submissionId: submission.id },
      { jobId: submission.id, attempts: 1 },
    );
    await waitForTerminalStatus(submission.id);

    // recomputeContestScore runs just after the submission is marked
    // COMPLETED, in the same job — poll rather than assume it's already
    // landed the instant the submission's own status flips.
    const score = await waitForContestScore(contest.id, user.id);
    expect(score.score).toBe(150);
    expect(score.solvedCount).toBe(1);

    // The Redis cache update is a further await after the ContestScore
    // upsert in the same function, so give it the same grace.
    let cached: string[] = [];
    for (let attempt = 0; attempt < 20 && cached.length === 0; attempt++) {
      cached = await workerHandle.redisClient.zrevrange(`leaderboard:${contest.id}`, 0, -1);
      if (cached.length === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(cached).toEqual([user.id]);
  }, 60_000);
});
