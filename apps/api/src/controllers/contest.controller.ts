import type { Request, Response } from "express";
import type { Redis } from "ioredis";
import { createContestSchema, updateContestSchema } from "@codearena/shared";
import * as contestService from "../services/contest.service.js";
import { AppError } from "../lib/AppError.js";

export function createContestController(redis: Redis) {
  return {
    async list(req: Request, res: Response) {
      const contests = await contestService.listContests(req.auth?.role);
      res.status(200).json({ contests });
    },

    async getById(req: Request, res: Response) {
      const contest = await contestService.getContestDetail(
        req.params.id as string,
        req.auth?.sub,
        req.auth?.role,
      );
      res.status(200).json(contest);
    },

    async create(req: Request, res: Response) {
      const input = createContestSchema.parse(req.body);
      const contest = await contestService.createContest(input);
      res.status(201).json(contest);
    },

    async update(req: Request, res: Response) {
      const input = updateContestSchema.parse(req.body);
      const contest = await contestService.updateContest(req.params.id as string, input);
      res.status(200).json(contest);
    },

    async register(req: Request, res: Response) {
      if (!req.auth) throw AppError.unauthorized();
      await contestService.registerForContest(req.params.id as string, req.auth.sub);
      res.status(204).send();
    },

    async getLeaderboard(req: Request, res: Response) {
      const leaderboard = await contestService.getLeaderboard(redis, req.params.id as string);
      res.status(200).json(leaderboard);
    },
  };
}
