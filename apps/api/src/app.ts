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
  app.use(createGeneralRateLimiter(redis));

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

  app.use("/api/v1/auth", createAuthRouter(env, redis));
  app.use("/api/v1/problems", createProblemRouter(env, redis));
  app.use("/api/v1/submissions", createSubmissionRouter(env, redis, submissionQueue));
  app.use("/api/v1/users", createUserSubmissionsRouter(env, submissionQueue));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
