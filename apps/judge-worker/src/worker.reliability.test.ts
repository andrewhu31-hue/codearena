import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { Redis } from "ioredis";
import { assertDedicatedTestDatabase, prisma } from "@codearena/database";
import { loadJudgeWorkerEnv } from "@codearena/config";
import { SUBMISSION_QUEUE_NAME, type SubmissionJobData } from "@codearena/shared";
import {
  recordFinalFailure,
  runOrphanedSubmissionReconciliationOnce,
  setLifecycleTimestampOnce,
  withTransientTerminalWriteRetry,
  withDbRetry,
} from "./worker.js";
import { createRedisClient } from "./lib/redis.js";

const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

function assertSafeCleanupTarget() {
  assertDedicatedTestDatabase(
    process.env.DATABASE_URL ?? "",
    "Judge worker reliability test cleanup",
  );
}

describeIfInfra("worker reliability", () => {
  let connection: Redis;
  let redisClient: Redis;

  beforeAll(() => {
    const env = loadJudgeWorkerEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    redisClient = createRedisClient(env);
  });

  afterAll(async () => {
    await Promise.allSettled([connection.quit(), redisClient.quit(), prisma.$disconnect()]);
  });

  beforeEach(async () => {
    assertSafeCleanupTarget();
    await redisClient.flushdb();
    await prisma.submissionFailureEvent.deleteMany();
    await prisma.submissionResult.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.contestScore.deleteMany();
    await prisma.contestRegistration.deleteMany();
    await prisma.contestProblem.deleteMany();
    await prisma.contest.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  async function seedSubmission(status: "QUEUED" | "RUNNING" = "QUEUED") {
    const user = await prisma.user.create({
      data: {
        email: `worker-rel-${Date.now()}@example.com`,
        username: `workerrel${Date.now()}`,
        passwordHash: "not-a-real-hash",
      },
    });

    const problem = await prisma.problem.create({
      data: {
        slug: `worker-rel-problem-${Date.now()}`,
        title: "Worker Reliability Problem",
        supportedLanguages: ["PYTHON"],
        testCases: { create: [{ input: "1", expectedOutput: "1", isSample: true }] },
      },
    });

    return prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print(1)",
        status,
        testsTotal: 1,
      },
    });
  }

  async function seedContestSubmission(status: "QUEUED" | "RUNNING" = "RUNNING") {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        email: `worker-rel-contest-${unique}@example.com`,
        username: `workerrelcontest${unique}`,
        passwordHash: "not-a-real-hash",
      },
    });

    const problem = await prisma.problem.create({
      data: {
        slug: `worker-rel-contest-problem-${unique}`,
        title: "Worker Reliability Contest Problem",
        supportedLanguages: ["PYTHON"],
        testCases: {
          create: [
            { input: "1", expectedOutput: "1", isSample: true },
            { input: "2", expectedOutput: "2", isSample: false },
          ],
        },
      },
      include: { testCases: true },
    });

    const contest = await prisma.contest.create({
      data: {
        name: `Worker Reliability Contest ${unique}`,
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 60_000),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId: problem.id, points: 100 }] },
      },
    });

    await prisma.contestRegistration.create({
      data: {
        contestId: contest.id,
        userId: user.id,
      },
    });

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        contestId: contest.id,
        language: "PYTHON",
        sourceCode: "print(1)",
        status,
        testsTotal: problem.testCases.length,
      },
    });

    return { user, contest, problem, submission };
  }

  it("retries transient database errors during terminal persistence", async () => {
    let attempts = 0;

    const result = await withDbRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("Can't reach database server at postgres:5432");
      }
      return "ok";
    }, 4);

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("retries transient P1001 terminal writes with bounded attempts", async () => {
    let attempts = 0;
    const result = await withTransientTerminalWriteRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error("Can't reach database server at postgres:5432") as Error & {
          code: string;
        };
        err.code = "P1001";
        throw err;
      }
      return "ok";
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("fails with infrastructure-style error when transient P1001 retries are exhausted", async () => {
    let attempts = 0;
    const infraError = new Error("can't reach database server") as Error & { code: string };
    infraError.code = "P1001";

    await expect(
      withTransientTerminalWriteRetry(async () => {
        attempts += 1;
        throw infraError;
      }),
    ).rejects.toMatchObject({ code: "P1001" });
    expect(attempts).toBe(3);
  });

  it("does not retry non-transient terminal write failures", async () => {
    let attempts = 0;
    await expect(
      withTransientTerminalWriteRetry(async () => {
        attempts += 1;
        throw new Error("validation failure");
      }),
    ).rejects.toThrow("validation failure");
    expect(attempts).toBe(1);
  });

  it("records terminal FAILED status and Bull failure metadata when retries are exhausted", async () => {
    const submission = await seedSubmission("QUEUED");

    const failedJob = {
      id: submission.id,
      data: { submissionId: submission.id },
      opts: { attempts: 3 },
      attemptsMade: 3,
      failedReason: "Missing lock for job",
      stalledCounter: 2,
    } as unknown as Job<SubmissionJobData>;

    await recordFinalFailure(failedJob, redisClient);

    const updated = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.verdict).toBe("INTERNAL_ERROR");
    expect(updated.lastFailureReason).toContain("Missing lock for job");

    const events = await prisma.submissionFailureEvent.findMany({
      where: { submissionId: submission.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.phase).toBe("WORKER_RETRY_EXHAUSTED");
    expect(events[0]?.bullState).toBe("failed");
    expect(events[0]?.attemptsMade).toBe(3);
    expect(events[0]?.maxAttempts).toBe(3);
    expect(events[0]?.stalledCount).toBe(2);
  });

  it("keeps exhausted infrastructure failures as INTERNAL_ERROR and never reclassifies as TLE", async () => {
    const submission = await seedSubmission("QUEUED");

    const failedJob = {
      id: submission.id,
      data: { submissionId: submission.id },
      opts: { attempts: 3 },
      attemptsMade: 3,
      failedReason: "Can't reach database server at postgres:5432",
      stalledCounter: 1,
    } as unknown as Job<SubmissionJobData>;

    await recordFinalFailure(failedJob, redisClient);

    const updated = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.verdict).toBe("INTERNAL_ERROR");
    expect(updated.verdict).not.toBe("TIME_LIMIT_EXCEEDED");
  });

  it("writes lifecycle timestamps only once and retries cannot overwrite them", async () => {
    const submission = await seedSubmission("RUNNING");

    const readLifecycle = async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          processingStartedAt: Date | null;
          terminalAt: Date | null;
          scorePersistedAt: Date | null;
        }>
      >(
        `SELECT "processingStartedAt", "terminalAt", "scorePersistedAt" FROM submissions WHERE id = $1`,
        submission.id,
      );
      return (
        rows[0] ?? {
          processingStartedAt: null,
          terminalAt: null,
          scorePersistedAt: null,
        }
      );
    };

    await setLifecycleTimestampOnce(submission.id, "processingStartedAt");
    await setLifecycleTimestampOnce(submission.id, "terminalAt");
    await setLifecycleTimestampOnce(submission.id, "scorePersistedAt");

    const firstWrite = await readLifecycle();
    expect(firstWrite.processingStartedAt).not.toBeNull();
    expect(firstWrite.terminalAt).not.toBeNull();
    expect(firstWrite.scorePersistedAt).not.toBeNull();

    const firstProcessing = firstWrite.processingStartedAt?.toISOString();
    const firstTerminal = firstWrite.terminalAt?.toISOString();
    const firstScorePersisted = firstWrite.scorePersistedAt?.toISOString();

    await new Promise((resolve) => setTimeout(resolve, 15));

    // Simulate retry/replay paths attempting to stamp timestamps again.
    await withTransientTerminalWriteRetry(async () => {
      await setLifecycleTimestampOnce(submission.id, "processingStartedAt");
      await setLifecycleTimestampOnce(submission.id, "terminalAt");
      await setLifecycleTimestampOnce(submission.id, "scorePersistedAt");
    });
    await withTransientTerminalWriteRetry(async () => {
      await setLifecycleTimestampOnce(submission.id, "processingStartedAt");
      await setLifecycleTimestampOnce(submission.id, "terminalAt");
      await setLifecycleTimestampOnce(submission.id, "scorePersistedAt");
    });

    const secondWrite = await readLifecycle();
    expect(secondWrite.processingStartedAt?.toISOString()).toBe(firstProcessing);
    expect(secondWrite.terminalAt?.toISOString()).toBe(firstTerminal);
    expect(secondWrite.scorePersistedAt?.toISOString()).toBe(firstScorePersisted);
  });

  it("replayed terminal persistence does not duplicate submission results or contest scores", async () => {
    const { submission, contest, user, problem } = await seedContestSubmission("RUNNING");
    const [firstCase, secondCase] = problem.testCases;
    if (!firstCase || !secondCase) {
      throw new Error("Expected two seeded test cases for replay persistence test");
    }
    const resultPayload = [
      {
        submissionId: submission.id,
        testCaseId: firstCase.id,
        passed: true,
        output: "1",
        runtimeMs: 5,
        memoryKb: 128,
      },
      {
        submissionId: submission.id,
        testCaseId: secondCase.id,
        passed: true,
        output: "2",
        runtimeMs: 6,
        memoryKb: 128,
      },
    ];

    const persistTerminalState = async () => {
      await prisma.$transaction(async (tx) => {
        await tx.submissionResult.deleteMany({ where: { submissionId: submission.id } });
        await tx.submissionResult.createMany({ data: resultPayload });
        await tx.submission.update({
          where: { id: submission.id },
          data: {
            status: "COMPLETED",
            verdict: "ACCEPTED",
            testsPassed: resultPayload.length,
            compilerOutput: null,
            runtimeMs: 6,
            memoryKb: 128,
          },
        });
        await tx.contestScore.upsert({
          where: { contestId_userId: { contestId: contest.id, userId: user.id } },
          update: { score: 100, solvedCount: 1, penaltyMs: 0 },
          create: {
            contestId: contest.id,
            userId: user.id,
            score: 100,
            solvedCount: 1,
            penaltyMs: 0,
          },
        });
      });
    };

    await persistTerminalState();
    await persistTerminalState();

    const storedResults = await prisma.submissionResult.findMany({
      where: { submissionId: submission.id },
    });
    expect(storedResults).toHaveLength(resultPayload.length);

    const scoreRows = await prisma.contestScore.findMany({
      where: { contestId: contest.id, userId: user.id },
    });
    expect(scoreRows).toHaveLength(1);
    expect(scoreRows[0]?.score).toBe(100);
    expect(scoreRows[0]?.solvedCount).toBe(1);
  });

  it("reconciles orphaned RUNNING submissions when Bull already has a terminal state", async () => {
    const submission = await seedSubmission("RUNNING");
    const staleTimestamp = new Date(Date.now() - 5 * 60 * 1000);
    await prisma.$executeRaw`
      UPDATE submissions
      SET "updatedAt" = ${staleTimestamp}
      WHERE id = ${submission.id}
    `;

    await connection.zadd(
      `bull:${SUBMISSION_QUEUE_NAME}:failed`,
      Date.now().toString(),
      submission.id,
    );

    await runOrphanedSubmissionReconciliationOnce(connection, redisClient);

    const updated = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.verdict).toBe("INTERNAL_ERROR");
    expect(updated.lastFailureReason).toContain("Reconciled orphaned RUNNING submission");

    const events = await prisma.submissionFailureEvent.findMany({
      where: { submissionId: submission.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.phase).toBe("ORPHAN_RECONCILIATION");
    expect(events[0]?.bullState).toBe("failed");
  });
});
