import type { Request, Response } from "express";
import type { Queue } from "bullmq";
import { z } from "zod";
import { createSubmissionSchema } from "@codearena/shared";
import * as submissionService from "../services/submission.service.js";
import { AppError } from "../lib/AppError.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export function createSubmissionController(queue: Queue) {
  return {
    async create(req: Request, res: Response) {
      if (!req.auth) throw AppError.unauthorized();
      const input = createSubmissionSchema.parse(req.body);
      const submission = await submissionService.createSubmission(queue, req.auth.sub, input);
      res.status(201).json(submission);
    },

    async getById(req: Request, res: Response) {
      if (!req.auth) throw AppError.unauthorized();
      const submission = await submissionService.getSubmissionById(
        req.auth.sub,
        req.auth.role,
        req.params.id as string,
      );
      res.status(200).json(submission);
    },

    async listMine(req: Request, res: Response) {
      if (!req.auth) throw AppError.unauthorized();
      const { page, pageSize } = listQuerySchema.parse(req.query);
      const result = await submissionService.listMySubmissions(req.auth.sub, page, pageSize);
      res.status(200).json(result);
    },
  };
}
