import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Redis } from "ioredis";
import { ERROR_CODES, type ApiErrorBody } from "@codearena/shared";
import type { Request, Response } from "express";

function jsonRateLimitResponse(res: Response, req: Request, retryAfterSeconds: number): void {
  res.setHeader("Retry-After", retryAfterSeconds);
  const body: ApiErrorBody = {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: "Too many requests, please try again later",
      requestId: req.requestId,
    },
  };
  res.status(429).json(body);
}

/**
 * Redis-backed so limits are shared across horizontally scaled API
 * instances (PRD §13) instead of being per-process.
 */
export function createAuthRateLimiter(
  redis: Redis,
  keyPrefix: string,
  max: number,
  windowMs: number,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${keyPrefix}:${req.ip}`,
    store: new RedisStore({
      prefix: `ratelimit:${keyPrefix}:`,
      sendCommand: (...args: string[]) => {
        const call = redis.call.bind(redis) as (...cmd: string[]) => Promise<unknown>;
        return call(...args) as never;
      },
    }),
    handler: (req, res) => jsonRateLimitResponse(res, req, Math.ceil(windowMs / 1000)),
  });
}
