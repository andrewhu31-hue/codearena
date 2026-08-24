import type { Request, Response } from "express";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { z } from "zod";
import { createSubmissionSchema } from "@codearena/shared";
import * as submissionService from "../services/submission.service.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export function createSubmissionController(queue: Queue, redis?: Redis) {
  return {
    async create(req: Request, res: Response) {
      if (!req.auth) throw AppError.unauthorized();
      const handlerStartedAt = Date.now();
      const input = createSubmissionSchema.parse(req.body);

      const idempotencyKey = req.get("Idempotency-Key")?.trim();
      let submissionId: string | null = null;
      let createResultTimings: submissionService.SubmissionCreateTimings | null = null;

      const logResponseLifecycle = (event: "finish" | "close" | "aborted") => {
        logger.info(
          {
            requestId: req.requestId,
            submissionId,
            idempotencyKey: idempotencyKey ?? null,
            lifecycleEvent: event,
            totalHandlerMs: Date.now() - handlerStartedAt,
            timings: createResultTimings,
          },
          "Submission request lifecycle event",
        );
      };

      req.on("aborted", () => logResponseLifecycle("aborted"));
      res.on("finish", () => logResponseLifecycle("finish"));
      res.on("close", () => logResponseLifecycle("close"));

      if (!idempotencyKey) {
        const result = await submissionService.createSubmission(queue, req.auth.sub, input);
        submissionId = result.submission.id;
        createResultTimings = result.timings;
        logger.info(
          {
            requestId: req.requestId,
            submissionId,
            idempotencyKey: null,
            timings: {
              ...result.timings,
              totalHandlerMs: Date.now() - handlerStartedAt,
            },
          },
          "Submission stage timings",
        );
        res.status(result.created ? 201 : 200).json(result.submission);
        return;
      }

      if (idempotencyKey.length > 128) {
        throw AppError.validation("Idempotency-Key must be 128 characters or fewer");
      }

      const redisKey = `idempotency:submissions:${req.auth.sub}:${idempotencyKey}`;
      if (!redis) {
        const result = await submissionService.createSubmission(queue, req.auth.sub, input, {
          idempotencyKey,
        });
        submissionId = result.submission.id;
        createResultTimings = result.timings;
        logger.info(
          {
            requestId: req.requestId,
            submissionId,
            idempotencyKey,
            timings: {
              ...result.timings,
              totalHandlerMs: Date.now() - handlerStartedAt,
            },
          },
          "Submission stage timings",
        );
        res.status(result.created ? 201 : 200).json(result.submission);
        return;
      }

      const lock = await redis.set(redisKey, "__inflight__", "PX", 15 * 60 * 1000, "NX");
      if (!lock) {
        const result = await submissionService.createSubmission(queue, req.auth.sub, input, {
          idempotencyKey,
        });
        submissionId = result.submission.id;
        createResultTimings = result.timings;
        logger.info(
          {
            requestId: req.requestId,
            submissionId,
            idempotencyKey,
            timings: {
              ...result.timings,
              totalHandlerMs: Date.now() - handlerStartedAt,
            },
          },
          "Submission stage timings",
        );
        res.status(result.created ? 201 : 200).json(result.submission);
        return;
      }

      try {
        const result = await submissionService.createSubmission(queue, req.auth.sub, input, {
          idempotencyKey,
        });
        submissionId = result.submission.id;
        createResultTimings = result.timings;
        await redis.set(redisKey, result.submission.id, "PX", 24 * 60 * 60 * 1000);
        logger.info(
          {
            requestId: req.requestId,
            submissionId,
            idempotencyKey,
            timings: {
              ...result.timings,
              totalHandlerMs: Date.now() - handlerStartedAt,
            },
          },
          "Submission stage timings",
        );
        res.status(result.created ? 201 : 200).json(result.submission);
      } catch (error) {
        await redis.del(redisKey);
        throw error;
      }
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
