import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import type { JudgeWorkerEnv } from "@codearena/config";
import { SUBMISSION_QUEUE_NAME, type SubmissionJobData } from "@codearena/shared";
import { evaluateSubmission } from "./execution/evaluate.js";
import {
  computeContestScoreSnapshot,
  publishContestScoreCache,
  recomputeContestScore,
} from "./contestScoring.js";
import { publishSubmissionUpdate } from "./lib/realtimePublisher.js";
import { createRedisClient } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { assertQueueWaitMsWithinBound, computeQueueWaitMs } from "./lib/timings.js";
import { inferPrismaPoolSize, instrumentRedisCommandLatency } from "./lib/diagnostics.js";
import { hasPrismaCode, withBoundedRetry } from "./lib/retry.js";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

// BullMQ defaults are aggressive for workloads with long-running containerized
// evaluations; a longer lock duration makes transient renew hiccups less likely
// to create false stalls.
const WORKER_LOCK_DURATION_MS = 60 * 1000;
const WORKER_MAX_STALLED_COUNT = 5;
const QUEUE_WAIT_SANITY_BOUND_MS = 12 * 60 * 60 * 1000;
const TRANSIENT_WRITE_RETRY_ATTEMPTS = 3;
const TRANSIENT_WRITE_RETRY_BASE_DELAY_MS = 250;
const TRANSIENT_WRITE_RETRY_MAX_DELAY_MS = 2_000;

// Prevent duplicate concurrent processing: only recover RUNNING rows that look
// stale (likely abandoned by a crashed worker).
const RUNNING_RECOVERY_GRACE_MS = 30 * 60 * 1000;
const MAX_FAILURE_REASON_CHARS = 2_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes("connection reset") ||
    message.includes("connection terminated") ||
    message.includes("timed out")
  );
}

function isTransientTerminalWriteError(err: unknown): boolean {
  return hasPrismaCode(err, "P1001") || isTransientDbError(err);
}

export async function withTransientTerminalWriteRetry<T>(
  op: (attempt: number) => Promise<T>,
  attempts = TRANSIENT_WRITE_RETRY_ATTEMPTS,
): Promise<T> {
  return withBoundedRetry(op, {
    maxAttempts: attempts,
    baseDelayMs: TRANSIENT_WRITE_RETRY_BASE_DELAY_MS,
    maxDelayMs: TRANSIENT_WRITE_RETRY_MAX_DELAY_MS,
    shouldRetry: isTransientTerminalWriteError,
    onRetry: ({ err, attempt, backoffMs }) => {
      logger.warn({ err, attempt, backoffMs }, "Retrying transient terminal/score write failure");
    },
  });
}

export async function setLifecycleTimestampOnce(
  submissionId: string,
  column:
    | "processingStartedAt"
    | "terminalAt"
    | "scorePersistedAt",
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE submissions SET "${column}" = COALESCE("${column}", NOW()) WHERE id = $1`,
    submissionId,
  );
}

async function getActivePostgresConnections(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ active_connections: number }>>`
      SELECT COUNT(*)::int AS active_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return rows[0]?.active_connections ?? null;
  } catch (err) {
    logger.warn({ err }, "Failed to sample active PostgreSQL connections");
    return null;
  }
}

export async function withDbRetry<T>(op: () => Promise<T>, retries = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      if (!isTransientDbError(err) || attempt === retries) throw err;
      await delay(250 * attempt);
    }
  }
  throw lastError;
}

function normalizeFailureReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? "Unknown worker failure").trim();
  if (!trimmed) return "Unknown worker failure";
  return trimmed.slice(0, MAX_FAILURE_REASON_CHARS);
}

interface ProcessJobDeps {
  env: Pick<JudgeWorkerEnv, "DATABASE_URL" | "JUDGE_WORKSPACE_DIR" | "JUDGE_WORKSPACE_HOST_DIR">;
  redisClient: Redis;
  queuedAtMs?: number;
}

interface StageTimings {
  queueWaitMs: number;
  dbReadMs: number;
  contestScoreSnapshotMs: number;
  judgeTotalMs: number;
  dockerStartupMs: number | null;
  executionMs: number | null;
  terminalTxAcquireMs: number;
  terminalDbPersistMs: number;
  contestScoreRecomputeMs: number;
}

function extractDockerStartupMs(compilerOutput: string | null): number | null {
  if (!compilerOutput) return null;
  const marker = "[timing] docker_startup_ms=";
  const start = compilerOutput.indexOf(marker);
  if (start < 0) return null;
  const after = compilerOutput.slice(start + marker.length);
  const value = Number(after.split(/\s+/)[0]);
  return Number.isFinite(value) ? value : null;
}

async function resolveBullState(connection: Redis, jobId: string): Promise<"failed" | "completed" | null> {
  const [failedScore, completedScore] = await Promise.all([
    connection.zscore(`bull:${SUBMISSION_QUEUE_NAME}:failed`, jobId),
    connection.zscore(`bull:${SUBMISSION_QUEUE_NAME}:completed`, jobId),
  ]);
  if (failedScore !== null) return "failed";
  if (completedScore !== null) return "completed";
  return null;
}

async function reconcileOrphanedRunningSubmissions(
  connection: Redis,
  redisClient: Redis,
): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const running = await withDbRetry(() =>
    prisma.submission.findMany({
      where: { status: "RUNNING", updatedAt: { lt: cutoff } },
      select: { id: true, userId: true, testsTotal: true },
      take: 200,
      orderBy: { updatedAt: "asc" },
    }),
  );

  for (const submission of running) {
    const bullState = await resolveBullState(connection, submission.id);
    if (!bullState) continue;

    const { count } = await withDbRetry(() =>
      prisma.submission.updateMany({
        where: { id: submission.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          verdict: "INTERNAL_ERROR",
          lastFailureReason: `Reconciled orphaned RUNNING submission (bull state: ${bullState})`,
          lastFailureAt: new Date(),
        },
      }),
    );
    if (count === 0) continue;

    await withTransientTerminalWriteRetry(async () => {
      await setLifecycleTimestampOnce(submission.id, "terminalAt");
    });

    await withDbRetry(() =>
      prisma.submissionFailureEvent.create({
        data: {
          submissionId: submission.id,
          phase: "ORPHAN_RECONCILIATION",
          reason: "RUNNING row was stale and Bull state was already terminal",
          bullState,
        },
      }),
    );

    await redisClient.incr("metrics:judge:failed").catch((err) => {
      logger.warn({ err }, "Failed to increment judge failure metric during reconciliation");
    });
    await publishSubmissionUpdate(redisClient, {
      submissionId: submission.id,
      userId: submission.userId,
      status: "FAILED",
      verdict: "INTERNAL_ERROR",
      testsPassed: 0,
      testsTotal: submission.testsTotal,
    });
    logger.warn({ submissionId: submission.id, bullState }, "Reconciled orphaned RUNNING submission");
  }
}

export async function runOrphanedSubmissionReconciliationOnce(
  connection: Redis,
  redisClient: Redis,
): Promise<void> {
  await reconcileOrphanedRunningSubmissions(connection, redisClient);
}

export async function processSubmissionJob(
  submissionId: string,
  { env, redisClient, queuedAtMs }: ProcessJobDeps,
): Promise<void> {
  const activeConnectionsAtStart = await getActivePostgresConnections();
  const inferredPrismaPoolSize = inferPrismaPoolSize(env.DATABASE_URL);
  const dbReadStart = Date.now();
  const submission = await withDbRetry(() =>
    prisma.submission.findUnique({
      where: { id: submissionId },
      include: { problem: { include: { testCases: { orderBy: { createdAt: "asc" } } } } },
    }),
  );
  const dbReadMs = Date.now() - dbReadStart;

  if (!submission) {
    logger.warn({ submissionId }, "Submission not found, skipping");
    return;
  }

  const startedAt = Date.now();
  const queueWaitMs = computeQueueWaitMs(startedAt, queuedAtMs);
  try {
    assertQueueWaitMsWithinBound(queueWaitMs, QUEUE_WAIT_SANITY_BOUND_MS);
  } catch (err) {
    logger.warn({ err, submissionId, queueWaitMs }, "Queue wait sanity assertion failed");
  }

  // Idempotency (PRD §11): a retried or duplicate delivery of the same job
  // must not re-score a submission that has already reached a terminal
  // state. QUEUED/RUNNING are both reprocessed, so a worker crash between
  // marking RUNNING and persisting a verdict doesn't strand the submission.
  if (TERMINAL_STATUSES.has(submission.status)) {
    logger.info({ submissionId, status: submission.status }, "Already judged, skipping");
    return;
  }

  const runningStaleBefore = new Date(Date.now() - RUNNING_RECOVERY_GRACE_MS);
  const claim = await withDbRetry(() =>
    prisma.submission.updateMany({
      where: {
        id: submissionId,
        OR: [
          { status: "QUEUED" },
          { status: "RUNNING", updatedAt: { lt: runningStaleBefore } },
        ],
      },
      data: { status: "RUNNING" },
    }),
  );
  if (claim.count === 0) {
    logger.info({ submissionId }, "Submission already claimed by an active worker, skipping");
    return;
  }

  await withTransientTerminalWriteRetry(async () => {
    await setLifecycleTimestampOnce(submissionId, "processingStartedAt");
  });

  await publishSubmissionUpdate(redisClient, {
    submissionId,
    userId: submission.userId,
    status: "RUNNING",
    verdict: null,
    testsPassed: 0,
    testsTotal: submission.testsTotal,
  });

  const {
    verdict,
    testResults,
    compilerOutput,
    runtimeMs,
    memoryKb,
    timeoutCategoryCounts,
    startupMs,
    teardownMs,
    wallTimeMs,
    contestantTotalRuntimeMs,
  } = await evaluateSubmission({
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
  const judgeTotalMs = Date.now() - startedAt;
  const testsPassed = testResults.filter((r) => r.passed).length;
  const contestScoreSnapshotStart = Date.now();
  const contestScoreSnapshot = submission.contestId
    ? await computeContestScoreSnapshot(submission.contestId, submission.userId, {
      submissionId,
      problemId: submission.problemId,
      verdict,
      createdAt: submission.createdAt,
    })
    : null;
  const contestScoreSnapshotMs = Date.now() - contestScoreSnapshotStart;

  const terminalPersistStart = Date.now();
  let terminalTxAcquireMs = 0;
  await withTransientTerminalWriteRetry(() => {
    const terminalTxAttemptStartedAt = Date.now();
    return prisma.$transaction(
      async (tx) => {
        terminalTxAcquireMs = Math.max(terminalTxAcquireMs, Date.now() - terminalTxAttemptStartedAt);
        await tx.submissionResult.deleteMany({ where: { submissionId } });
        await tx.submissionResult.createMany({
          data: testResults.map((r) => ({
            submissionId,
            testCaseId: r.testCaseId,
            passed: r.passed,
            output: r.output,
            runtimeMs: r.runtimeMs,
            memoryKb: r.memoryKb,
          })),
        });

        // testsTotal is set once at submission creation from the problem's full
        // test count and never revisited here — stopping at the first failing
        // test means testResults.length is often smaller than the total.
        await tx.submission.update({
          where: { id: submissionId },
          data: { status: "COMPLETED", verdict, testsPassed, compilerOutput, runtimeMs, memoryKb },
        });

        if (submission.contestId && contestScoreSnapshot) {
          await tx.contestScore.upsert({
            where: {
              contestId_userId: {
                contestId: submission.contestId,
                userId: submission.userId,
              },
            },
            update: {
              score: contestScoreSnapshot.score,
              solvedCount: contestScoreSnapshot.solvedCount,
              penaltyMs: contestScoreSnapshot.penaltyMs,
            },
            create: {
              contestId: submission.contestId,
              userId: submission.userId,
              score: contestScoreSnapshot.score,
              solvedCount: contestScoreSnapshot.solvedCount,
              penaltyMs: contestScoreSnapshot.penaltyMs,
            },
          });
        }
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  });

  await withTransientTerminalWriteRetry(async () => {
    await setLifecycleTimestampOnce(submissionId, "terminalAt");
  });
  if (submission.contestId && contestScoreSnapshot) {
    await withTransientTerminalWriteRetry(async () => {
      await setLifecycleTimestampOnce(submissionId, "scorePersistedAt");
    });
  }

  const terminalDbPersistMs = Date.now() - terminalPersistStart;

  let contestScoreRecomputeMs = 0;
  if (submission.contestId && contestScoreSnapshot) {
    const scorePersistStart = Date.now();
    await publishContestScoreCache(
      redisClient,
      submission.contestId,
      submission.userId,
      contestScoreSnapshot,
    );
    contestScoreRecomputeMs = Date.now() - scorePersistStart;
  }

  const stageTimings: StageTimings = {
    queueWaitMs,
    dbReadMs,
    contestScoreSnapshotMs,
    judgeTotalMs,
    dockerStartupMs: extractDockerStartupMs(compilerOutput),
    executionMs: runtimeMs,
    terminalTxAcquireMs,
    terminalDbPersistMs,
    contestScoreRecomputeMs,
  };

  await publishSubmissionUpdate(redisClient, {
    submissionId,
    userId: submission.userId,
    status: "COMPLETED",
    verdict,
    testsPassed,
    testsTotal: submission.testsTotal,
  });

  if (submission.contestId) {
    const recomputeStartedAt = Date.now();
    await recomputeContestScore(redisClient, submission.contestId, submission.userId).catch((err) => {
      logger.warn(
        { err, submissionId, contestId: submission.contestId, userId: submission.userId },
        "Best-effort contest score reconciliation after completion failed",
      );
    });
    contestScoreRecomputeMs = Math.max(contestScoreRecomputeMs, Date.now() - recomputeStartedAt);
  }
  stageTimings.contestScoreRecomputeMs = contestScoreRecomputeMs;

  const judgeDurationMs = Date.now() - startedAt;
  await redisClient.incr("metrics:judge:succeeded").catch((err) => {
    logger.warn({ err }, "Failed to increment judge success metric");
  });

  logger.info(
    {
      submissionId,
      verdict,
      testsPassed,
      testsTotal: submission.testsTotal,
      judgeDurationMs,
      lockDurationMs: WORKER_LOCK_DURATION_MS,
      lockDurationUtilization: Number((judgeDurationMs / WORKER_LOCK_DURATION_MS).toFixed(3)),
      activePostgresConnectionsAtStart: activeConnectionsAtStart,
      activePostgresConnectionsAtEnd: await getActivePostgresConnections(),
      inferredPrismaPoolSize,
      stageTimings,
      timeoutCategoryCounts,
      startupMs,
      teardownMs,
      wallTimeMs,
      contestantTotalRuntimeMs,
    },
    "Judged",
  );
}

export async function recordFinalFailure(
  job: Job<SubmissionJobData> | undefined,
  redisClient: Redis,
): Promise<void> {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return; // more retries remain

  const { submissionId } = job.data;
  const reason = normalizeFailureReason(job.failedReason);
  const stalledCount =
    typeof (job as { stalledCounter?: unknown }).stalledCounter === "number"
      ? ((job as { stalledCounter: number }).stalledCounter ?? 0)
      : null;
  try {
    const { count } = await withTransientTerminalWriteRetry(() =>
      prisma.submission.updateMany({
        where: { id: submissionId, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: "FAILED",
          verdict: "INTERNAL_ERROR",
          lastFailureReason: reason,
          lastFailureAt: new Date(),
        },
      }),
    );
    await withTransientTerminalWriteRetry(async () => {
      await setLifecycleTimestampOnce(submissionId, "terminalAt");
    });
    if (count > 0) {
      await withDbRetry(() =>
        prisma.submissionFailureEvent.create({
          data: {
            submissionId,
            phase: "WORKER_RETRY_EXHAUSTED",
            reason,
            bullState: "failed",
            attemptsMade: job.attemptsMade,
            maxAttempts,
            stalledCount,
          },
        }),
      );

      await redisClient.incr("metrics:judge:failed").catch((err) => {
        logger.warn({ err }, "Failed to increment judge failure metric");
      });
      const submission = await withDbRetry(() =>
        prisma.submission.findUnique({
          where: { id: submissionId },
          select: { userId: true, testsTotal: true },
        }),
      );
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
  reconciler: NodeJS.Timeout;
}

export function createSubmissionWorker(env: JudgeWorkerEnv): SubmissionWorkerHandle {
  // BullMQ requires `maxRetriesPerRequest: null` on Worker connections
  // because it issues blocking commands. Kept separate from the
  // general-purpose client used for pub/sub and the leaderboard cache.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const redisClient = createRedisClient(env);
  instrumentRedisCommandLatency(connection, "bullmq-connection", logger);
  instrumentRedisCommandLatency(redisClient, "worker-redis-client", logger);

  const worker = new Worker<SubmissionJobData>(
    SUBMISSION_QUEUE_NAME,
    async (job: Job<SubmissionJobData>) => {
      await processSubmissionJob(job.data.submissionId, {
        env,
        redisClient,
        queuedAtMs: typeof job.timestamp === "number" ? job.timestamp : undefined,
      });
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
      lockDuration: WORKER_LOCK_DURATION_MS,
      maxStalledCount: WORKER_MAX_STALLED_COUNT,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Submission job failed");
    void recordFinalFailure(job, redisClient);
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker connection error");
  });

  const reconciler = setInterval(() => {
    void runOrphanedSubmissionReconciliationOnce(connection, redisClient).catch((err) => {
      logger.error({ err }, "Failed orphaned submission reconciliation pass");
    });
  }, 60_000);

  // Keep process exit behavior predictable; the interval is background hygiene.
  if (typeof reconciler.unref === "function") reconciler.unref();

  return { worker, connection, redisClient, reconciler };
}
