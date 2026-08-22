import express, { type Express, type Request } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import type { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { ApiEnv } from "@codearena/config";
import { prisma } from "@codearena/database";
import { requestId } from "./middleware/requestId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createProblemRouter } from "./routes/problem.routes.js";
import { createSubmissionRouter, createUserSubmissionsRouter } from "./routes/submission.routes.js";
import { createContestRouter } from "./routes/contest.routes.js";
import { createGeneralRateLimiter } from "./middleware/rateLimit.js";
import { logger } from "./lib/logger.js";

export function createApp(env: ApiEnv, redis: Redis, submissionQueue: Queue): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId,
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(
    createGeneralRateLimiter(redis, env.GENERAL_RATE_LIMIT_MAX, env.GENERAL_RATE_LIMIT_WINDOW_MS),
  );

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    try {
      await Promise.all([redis.ping(), prisma.$queryRaw`SELECT 1`]);
      res.status(200).json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not-ready" });
    }
  });

  // PRD §15: queue depth and worker success/failure counts. Judge-worker
  // increments the Redis counters directly (it has no HTTP server to poll);
  // this just reads them back alongside a live queue snapshot.
  app.get("/metrics", async (_req, res) => {
    try {
      const [counts, judgeSucceeded, judgeFailed] = await Promise.all([
        submissionQueue.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
        redis.get("metrics:judge:succeeded"),
        redis.get("metrics:judge:failed"),
      ]);
      res.status(200).json({
        queue: counts,
        judge: {
          succeeded: Number(judgeSucceeded ?? 0),
          failed: Number(judgeFailed ?? 0),
        },
      });
    } catch (err) {
      logger.error({ err }, "Failed to collect metrics");
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/api/v1/auth", createAuthRouter(env, redis));
  app.use("/api/v1/problems", createProblemRouter(env, redis));
  app.use("/api/v1/submissions", createSubmissionRouter(env, redis, submissionQueue));
  app.use("/api/v1/users", createUserSubmissionsRouter(env, submissionQueue));
  app.use("/api/v1/contests", createContestRouter(env, redis));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
