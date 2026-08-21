import { Router } from "express";
import type { Redis } from "ioredis";
import type { ApiEnv } from "@codearena/config";
import { createContestController } from "../controllers/contest.controller.js";
import { authenticate, optionalAuthenticate, requireRole } from "../middleware/authenticate.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export function createContestRouter(env: ApiEnv, redis: Redis): Router {
  const router = Router();
  const controller = createContestController(redis);
  const optionalAuth = optionalAuthenticate(env);

  router.get("/", optionalAuth, asyncHandler(controller.list));
  router.get("/:id", optionalAuth, asyncHandler(controller.getById));
  router.get("/:id/leaderboard", asyncHandler(controller.getLeaderboard));
  router.post("/", authenticate(env), requireRole("ADMIN"), asyncHandler(controller.create));
  router.patch("/:id", authenticate(env), requireRole("ADMIN"), asyncHandler(controller.update));
  router.post("/:id/register", authenticate(env), asyncHandler(controller.register));

  return router;
}
