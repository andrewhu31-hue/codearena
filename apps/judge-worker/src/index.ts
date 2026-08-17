import { loadJudgeWorkerEnv } from "@codearena/config";
import { prisma } from "@codearena/database";
import { createSubmissionWorker } from "./worker.js";
import { logger } from "./lib/logger.js";

const env = loadJudgeWorkerEnv();
const { worker, connection } = createSubmissionWorker(env);

logger.info({ concurrency: env.WORKER_CONCURRENCY }, "Judge worker listening");

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  // Waits for in-flight jobs to finish before closing, so a deploy or
  // restart doesn't abandon a submission mid-judgement.
  await Promise.allSettled([worker.close(), prisma.$disconnect()]);
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
