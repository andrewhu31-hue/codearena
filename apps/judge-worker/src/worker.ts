import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import type { JudgeWorkerEnv } from "@codearena/config";
import { SUBMISSION_QUEUE_NAME, type SubmissionJobData } from "@codearena/shared";
import { evaluateSubmission } from "./execution/evaluate.js";
import { recomputeContestScore } from "./contestScoring.js";
import { publishSubmissionUpdate } from "./lib/realtimePublisher.js";
import { createRedisClient } from "./lib/redis.js";
import { logger } from "./lib/logger.js";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

// Generous headroom above a realistic worst case (compile ~10s + several
// test cases, each bounded by the problem's own time limit plus the
// execution engine's start-up buffer) — this is a backstop against the
// worker hanging, not the thing enforcing per-test limits.
const JOB_TIMEOUT_MS = 120_000;

interface ProcessJobDeps {
  env: Pick<JudgeWorkerEnv, "JUDGE_WORKSPACE_DIR" | "JUDGE_WORKSPACE_HOST_DIR">;
  redisClient: Redis;
}

export async function processSubmissionJob(
  submissionId: string,
  { env, redisClient }: ProcessJobDeps,
): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { problem: { include: { testCases: { orderBy: { createdAt: "asc" } } } } },
  });

  if (!submission) {
    logger.warn({ submissionId }, "Submission not found, skipping");
    return;
  }

  const startedAt = Date.now();

  // Idempotency (PRD §11): a retried or duplicate delivery of the same job
  // must not re-score a submission that has already reached a terminal
  // state. QUEUED/RUNNING are both reprocessed, so a worker crash between
  // marking RUNNING and persisting a verdict doesn't strand the submission.
  if (TERMINAL_STATUSES.has(submission.status)) {
    logger.info({ submissionId, status: submission.status }, "Already judged, skipping");
    return;
  }

  await prisma.submission.update({ where: { id: submissionId }, data: { status: "RUNNING" } });
  await publishSubmissionUpdate(redisClient, {
    submissionId,
    userId: submission.userId,
    status: "RUNNING",
    verdict: null,
    testsPassed: 0,
    testsTotal: submission.testsTotal,
  });

  const { verdict, testResults, compilerOutput, runtimeMs, memoryKb } = await evaluateSubmission({
    submissionId,
    problemSlug: submission.problem.slug,
    language: submission.language,
    sourceCode: submission.sourceCode,
    timeLimitMs: submission.problem.timeLimitMs,
    memoryLimitMb: submission.problem.memoryLimitMb,
    testCases: submission.problem.testCases.map((tc) => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
    })),
    workspaceDir: env.JUDGE_WORKSPACE_DIR,
    workspaceHostDir: env.JUDGE_WORKSPACE_HOST_DIR,
  });
  const testsPassed = testResults.filter((r) => r.passed).length;

  await prisma.$transaction([
    prisma.submissionResult.deleteMany({ where: { submissionId } }),
    prisma.submissionResult.createMany({
      data: testResults.map((r) => ({
        submissionId,
        testCaseId: r.testCaseId,
        passed: r.passed,
        output: r.output,
        runtimeMs: r.runtimeMs,
        memoryKb: r.memoryKb,
      })),
    }),
    // testsTotal is set once at submission creation from the problem's full
    // test count and never revisited here — stopping at the first failing
    // test means testResults.length is often smaller than the total.
    prisma.submission.update({
      where: { id: submissionId },
      data: { status: "COMPLETED", verdict, testsPassed, compilerOutput, runtimeMs, memoryKb },
    }),
  ]);

  await publishSubmissionUpdate(redisClient, {
    submissionId,
    userId: submission.userId,
    status: "COMPLETED",
    verdict,
    testsPassed,
    testsTotal: submission.testsTotal,
  });

  if (submission.contestId) {
    await recomputeContestScore(redisClient, submission.contestId, submission.userId);
  }

  const judgeDurationMs = Date.now() - startedAt;
  await redisClient.incr("metrics:judge:succeeded").catch((err) => {
    logger.warn({ err }, "Failed to increment judge success metric");
  });

  logger.info(
    { submissionId, verdict, testsPassed, testsTotal: submission.testsTotal, judgeDurationMs },
    "Judged",
  );
}

async function recordFinalFailure(
  job: Job<SubmissionJobData> | undefined,
  redisClient: Redis,
): Promise<void> {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return; // more retries remain

  const { submissionId } = job.data;
  try {
    const { count } = await prisma.submission.updateMany({
      where: { id: submissionId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "FAILED", verdict: "INTERNAL_ERROR" },
    });
    if (count > 0) {
      await redisClient.incr("metrics:judge:failed").catch((err) => {
        logger.warn({ err }, "Failed to increment judge failure metric");
      });
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { userId: true, testsTotal: true },
      });
      if (submission) {
        await publishSubmissionUpdate(redisClient, {
          submissionId,
          userId: submission.userId,
          status: "FAILED",
          verdict: "INTERNAL_ERROR",
          testsPassed: 0,
          testsTotal: submission.testsTotal,
        });
      }
    }
  } catch (err) {
    logger.error({ err, submissionId }, "Failed to record terminal failure");
  }
}

export interface SubmissionWorkerHandle {
  worker: Worker<SubmissionJobData>;
  connection: Redis;
  redisClient: Redis;
}

export function createSubmissionWorker(env: JudgeWorkerEnv): SubmissionWorkerHandle {
  // BullMQ requires `maxRetriesPerRequest: null` on Worker connections
  // because it issues blocking commands. Kept separate from the
  // general-purpose client used for pub/sub and the leaderboard cache.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const redisClient = createRedisClient(env);

  const worker = new Worker<SubmissionJobData>(
    SUBMISSION_QUEUE_NAME,
    async (job: Job<SubmissionJobData>) => {
      await Promise.race([
        processSubmissionJob(job.data.submissionId, { env, redisClient }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Submission job timed out")), JOB_TIMEOUT_MS),
        ),
      ]);
    },
    { connection, concurrency: env.WORKER_CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Submission job failed");
    void recordFinalFailure(job, redisClient);
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker connection error");
  });

  return { worker, connection, redisClient };
}
