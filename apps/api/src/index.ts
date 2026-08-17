import { loadApiEnv } from "@codearena/config";
import { prisma } from "@codearena/database";
import { createApp } from "./app.js";
import { createRedisClient } from "./lib/redis.js";
import { createSubmissionQueue } from "./lib/queue.js";
import { logger } from "./lib/logger.js";

const env = loadApiEnv();
const redis = createRedisClient(env);
const { queue: submissionQueue, connection: queueConnection } = createSubmissionQueue(env);
const app = createApp(env, redis, submissionQueue);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "API listening");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Error closing HTTP server");
    }
    await Promise.allSettled([
      prisma.$disconnect(),
      redis.quit(),
      submissionQueue.close(),
      queueConnection.quit(),
    ]);
    process.exit(err ? 1 : 0);
  });

  // Force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
