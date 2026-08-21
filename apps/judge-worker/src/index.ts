import { loadJudgeWorkerEnv } from "@codearena/config";
import { prisma } from "@codearena/database";
import { createSubmissionWorker } from "./worker.js";
import { isDockerAvailable } from "./execution/dockerAvailable.js";
import { logger } from "./lib/logger.js";

const env = loadJudgeWorkerEnv();

// Fail fast and loud rather than accepting jobs it can never actually
// judge: every submission is evaluated inside a Docker sandbox (PRD §12),
// so a worker with no Docker daemon is not just degraded, it's useless.
if (!isDockerAvailable()) {
  logger.fatal(
    "Docker is not available (`docker info` failed). The judge worker cannot evaluate " +
      "submissions without it — see docs/judge-security.md.",
  );
  process.exit(1);
}

const { worker, connection, redisClient } = createSubmissionWorker(env);

logger.info({ concurrency: env.WORKER_CONCURRENCY }, "Judge worker listening");

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  // Waits for in-flight jobs to finish before closing, so a deploy or
  // restart doesn't abandon a submission mid-judgement.
  await Promise.allSettled([worker.close(), prisma.$disconnect()]);
  await Promise.allSettled([connection.quit(), redisClient.quit()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
