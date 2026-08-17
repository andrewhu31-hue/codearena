import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import { loadJudgeWorkerEnv } from "@codearena/config";
import { SUBMISSION_QUEUE_NAME } from "@codearena/shared";
import { createSubmissionWorker, type SubmissionWorkerHandle } from "./worker.js";

/**
 * Deterministic lifecycle test (PRD §16): create a user, a problem, and a
 * QUEUED submission directly in Postgres (standing in for what the API's
 * `POST /submissions` does), enqueue the same job the API would enqueue,
 * and confirm the real BullMQ worker in this app carries it all the way to
 * a persisted verdict. Runs against a real Postgres + Redis, like
 * `apps/api/src/auth.test.ts`; skipped automatically when those aren't
 * configured.
 */
const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

async function waitForTerminalStatus(submissionId: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });
    if (submission.status === "COMPLETED" || submission.status === "FAILED") return submission;
    if (Date.now() > deadline) throw new Error("Timed out waiting for submission to finish");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function seedProblemWithTests() {
  const problem = await prisma.problem.create({
    data: {
      slug: `lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "Lifecycle Test Problem",
      supportedLanguages: ["PYTHON"],
      testCases: {
        create: [
          { input: "1", expectedOutput: "one", isSample: true },
          { input: "2", expectedOutput: "two", isSample: false },
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

describeIfInfra("submission lifecycle", () => {
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
    await prisma.submissionResult.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await queue.close();
    await queueConnection.quit();
    await workerHandle.worker.close();
    await workerHandle.connection.quit();
    await prisma.$disconnect();
  });

  it("judges a correct (directive-free) submission as ACCEPTED", async () => {
    const { problem, user } = await seedProblemWithTests();

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print('the actual solution')",
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

    const results = await prisma.submissionResult.findMany({
      where: { submissionId: submission.id },
    });
    expect(results).toHaveLength(problem.testCases.length);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("judges a submission with a WRONG_ANSWER directive accordingly", async () => {
    const { problem, user } = await seedProblemWithTests();

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "# CODEARENA_VERDICT: WRONG_ANSWER\nprint('nope')",
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
  });

  it("does not reprocess a submission that already reached a terminal state", async () => {
    const { problem, user } = await seedProblemWithTests();

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
});
