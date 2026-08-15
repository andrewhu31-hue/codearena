import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ERROR_CODES, type ApiErrorBody } from "@codearena/shared";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        requestId: req.requestId,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Request validation failed",
        requestId: req.requestId,
        details: err.flatten(),
      },
    };
    res.status(400).json(body);
    return;
  }

  logger.error({ err, requestId: req.requestId }, "Unhandled error");

  const body: ApiErrorBody = {
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "An unexpected error occurred",
      requestId: req.requestId,
    },
  };
  res.status(500).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `No route for ${req.method} ${req.path}`,
      requestId: req.requestId,
    },
  };
  res.status(404).json(body);
}
