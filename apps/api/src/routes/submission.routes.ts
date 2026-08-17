import { Router } from "express";
import type { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { ApiEnv } from "@codearena/config";
import { createSubmissionController } from "../controllers/submission.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createUserRateLimiter } from "../middleware/rateLimit.js";

export function createSubmissionRouter(env: ApiEnv, redis: Redis, queue: Queue): Router {
  const router = Router();
  const controller = createSubmissionController(queue);
  const submissionLimiter = createUserRateLimiter(
    redis,
    "submission",
    env.SUBMISSION_RATE_LIMIT_MAX,
    env.SUBMISSION_RATE_LIMIT_WINDOW_MS,
  );

  router.post("/", authenticate(env), submissionLimiter, asyncHandler(controller.create));
  router.get("/:id", authenticate(env), asyncHandler(controller.getById));

  return router;
}

export function createUserSubmissionsRouter(env: ApiEnv, queue: Queue): Router {
  const router = Router();
  const controller = createSubmissionController(queue);

  router.get("/me/submissions", authenticate(env), asyncHandler(controller.listMine));

  return router;
}
