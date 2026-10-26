import { Router } from "express";
import type { Redis } from "ioredis";
import type { ApiEnv } from "@codearena/config";
import { requestHintSchema, type AiStatusResponse } from "@codearena/shared";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createUserRateLimiter } from "../middleware/rateLimit.js";
import { AppError } from "../lib/AppError.js";
import type { AiProvider } from "../lib/ai.js";
import * as aiService from "../services/ai.service.js";

export function createAiRouter(env: ApiEnv, redis: Redis, provider: AiProvider | null): Router {
  const router = Router();
  // Only calls that may reach the model count against this limit; reading
  // already-unlocked hints or a stored review doesn't.
  const aiLimiter = createUserRateLimiter(
    redis,
    "ai",
    env.AI_RATE_LIMIT_MAX,
    env.AI_RATE_LIMIT_WINDOW_MS,
  );

  router.get("/status", (_req, res) => {
    const body: AiStatusResponse = { enabled: provider !== null };
    res.json(body);
  });

  router.get(
    "/problems/:slug/hints",
    authenticate(env),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw AppError.unauthorized();
      res.json(await aiService.getHints(req.auth.sub, req.params.slug as string));
    }),
  );

  router.post(
    "/problems/:slug/hints",
    authenticate(env),
    aiLimiter,
    asyncHandler(async (req, res) => {
      if (!req.auth) throw AppError.unauthorized();
      const { level } = requestHintSchema.parse(req.body);
      res.json(
        await aiService.unlockHint(provider, req.auth.sub, req.params.slug as string, level),
      );
    }),
  );

  router.get(
    "/submissions/:id/review",
    authenticate(env),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw AppError.unauthorized();
      const review = await aiService.getReview(req.auth.sub, req.params.id as string);
      if (!review) throw AppError.notFound("No review yet for this submission");
      res.json(review);
    }),
  );

  router.post(
    "/submissions/:id/review",
    authenticate(env),
    aiLimiter,
    asyncHandler(async (req, res) => {
      if (!req.auth) throw AppError.unauthorized();
      res.json(await aiService.createReview(provider, req.auth.sub, req.params.id as string));
    }),
  );

  return router;
}
