import type { Request, Response } from "express";
import type { Redis } from "ioredis";
import type { ApiEnv } from "@codearena/config";
import { createProblemSchema, updateProblemSchema } from "@codearena/shared";
import * as problemService from "../services/problem.service.js";

export function createProblemController(env: ApiEnv, redis: Redis) {
  return {
    async list(_req: Request, res: Response) {
      const problems = await problemService.listProblems(redis, env.PROBLEM_CACHE_TTL_SECONDS);
      res.status(200).json({ problems });
    },

    async getBySlug(req: Request, res: Response) {
      const problem = await problemService.getProblemDetail(
        redis,
        env.PROBLEM_CACHE_TTL_SECONDS,
        req.params.slug as string,
      );
      res.status(200).json(problem);
    },

    async create(req: Request, res: Response) {
      const input = createProblemSchema.parse(req.body);
      const problem = await problemService.createProblem(redis, input);
      res.status(201).json(problem);
    },

    async update(req: Request, res: Response) {
      const input = updateProblemSchema.parse(req.body);
      const problem = await problemService.updateProblem(redis, req.params.id as string, input);
      res.status(200).json(problem);
    },
  };
}
