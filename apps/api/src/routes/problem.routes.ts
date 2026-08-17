import { Router } from "express";
import type { Redis } from "ioredis";
import type { ApiEnv } from "@codearena/config";
import { createProblemController } from "../controllers/problem.controller.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export function createProblemRouter(env: ApiEnv, redis: Redis): Router {
  const router = Router();
  const controller = createProblemController(env, redis);

  router.get("/", asyncHandler(controller.list));
  router.get("/:slug", asyncHandler(controller.getBySlug));
  router.post("/", authenticate(env), requireRole("ADMIN"), asyncHandler(controller.create));
  router.patch("/:id", authenticate(env), requireRole("ADMIN"), asyncHandler(controller.update));

  return router;
}
