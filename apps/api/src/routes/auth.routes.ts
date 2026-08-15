import { Router } from "express";
import type { Redis } from "ioredis";
import type { ApiEnv } from "@codearena/config";
import { createAuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createAuthRateLimiter } from "../middleware/rateLimit.js";

export function createAuthRouter(env: ApiEnv, redis: Redis): Router {
  const router = Router();
  const controller = createAuthController(env);

  const loginLimiter = createAuthRateLimiter(redis, "login", 10, 15 * 60 * 1000);
  const registerLimiter = createAuthRateLimiter(redis, "register", 5, 60 * 60 * 1000);

  router.post("/register", registerLimiter, asyncHandler(controller.register));
  router.post("/login", loginLimiter, asyncHandler(controller.login));
  router.post("/refresh", asyncHandler(controller.refresh));
  router.post("/logout", asyncHandler(controller.logout));
  router.get("/me", authenticate(env), asyncHandler(controller.me));

  return router;
}
