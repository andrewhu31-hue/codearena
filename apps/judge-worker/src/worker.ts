import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import type { JudgeWorkerEnv } from "@codearena/config";
import { SUBMISSION_QUEUE_NAME, type SubmissionJobData } from "@codearena/shared";
import { evaluateSubmission } from "./mockEvaluator.js";
import { logger } from "./lib/logger.js";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

// The mock evaluator is synchronous and fast; a real per-test execution
// timeout is enforced inside the Docker sandbox starting in Milestone 3.
// This bound only guards against the worker hanging on a stalled query.
const JOB_TIMEOUT_MS = 30_000;

export async function processSubmissionJob(submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { problem: { include: { testCases: true } } },
  });

  if (!submission) {
    logger.warn({ submissionId }, "Submission not found, skipping");
    return;
  }

  // Idempotency (PRD §11): a retried or duplicate delivery of the same job
  // must not re-score a submission that has already reached a terminal
  // state. QUEUED/RUNNING are both reprocessed, so a worker crash between
  // marking RUNNING and persisting a verdict doesn't strand the submission.
  if (TERMINAL_STATUSES.has(submission.status)) {
    logger.info({ submissionId, status: submission.status }, "Already judged, skipping");
    return;
  }

  await prisma.submission.update({ where: { id: submissionId }, data: { status: "RUNNING" } });

  const { verdict, testResults } = evaluateSubmission(
    submission.sourceCode,
    submission.problem.testCases.map((tc) => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
    })),
  );
  const testsPassed = testResults.filter((r) => r.passed).length;

  await prisma.$transaction([
    prisma.submissionResult.deleteMany({ where: { submissionId } }),
    prisma.submissionResult.createMany({
      data: testResults.map((r) => ({
        submissionId,
        testCaseId: r.testCaseId,
        passed: r.passed,
        output: r.output,
      })),
    }),
    prisma.submission.update({
      where: { id: submissionId },
      data: { status: "COMPLETED", verdict, testsPassed, testsTotal: testResults.length },
    }),
  ]);

  logger.info({ submissionId, verdict, testsPassed, testsTotal: testResults.length }, "Judged");
}

async function recordFinalFailure(job: Job<SubmissionJobData> | undefined): Promise<void> {
  if (!job) return;
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return; // more retries remain

  const { submissionId } = job.data;
  try {
    await prisma.submission.updateMany({
      where: { id: submissionId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "FAILED", verdict: "INTERNAL_ERROR" },
    });
  } catch (err) {
    logger.error({ err, submissionId }, "Failed to record terminal failure");
  }
}

export interface SubmissionWorkerHandle {
  worker: Worker<SubmissionJobData>;
  connection: Redis;
}

export function createSubmissionWorker(env: JudgeWorkerEnv): SubmissionWorkerHandle {
  // BullMQ requires `maxRetriesPerRequest: null` on Worker connections
  // because it issues blocking commands.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<SubmissionJobData>(
    SUBMISSION_QUEUE_NAME,
    async (job: Job<SubmissionJobData>) => {
      await Promise.race([
        processSubmissionJob(job.data.submissionId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Submission job timed out")), JOB_TIMEOUT_MS),
        ),
      ]);
    },
    { connection, concurrency: env.WORKER_CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Submission job failed");
    void recordFinalFailure(job);
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker connection error");
  });

  return { worker, connection };
}
