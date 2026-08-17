import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Redis } from "ioredis";
import { ERROR_CODES, type ApiErrorBody } from "@codearena/shared";
import type { NextFunction, Request, Response } from "express";

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
function createRateLimiter(
  redis: Redis,
  keyPrefix: string,
  max: number,
  windowMs: number,
  keyGenerator: (req: Request) => string,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
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

export function createAuthRateLimiter(
  redis: Redis,
  keyPrefix: string,
  max: number,
  windowMs: number,
) {
  return createRateLimiter(redis, keyPrefix, max, windowMs, (req) => `${keyPrefix}:${req.ip}`);
}

/**
 * Keyed by authenticated user rather than IP, since a single user's
 * submission rate is what PRD §13 asks to bound (not shared connections
 * behind NAT/a proxy). Must run after `authenticate` so `req.auth` exists.
 */
export function createUserRateLimiter(
  redis: Redis,
  keyPrefix: string,
  max: number,
  windowMs: number,
) {
  const limiter = createRateLimiter(
    redis,
    keyPrefix,
    max,
    windowMs,
    (req) => `${keyPrefix}:${req.auth?.sub ?? req.ip}`,
  );
  return (req: Request, res: Response, next: NextFunction): void => {
    limiter(req, res, next);
  };
}

/**
 * A general, generous limit applied to every request, distinct from the
 * tighter per-endpoint limits above (PRD §13: "separate limits ... for
 * general requests").
 */
export function createGeneralRateLimiter(redis: Redis) {
  return createRateLimiter(redis, "general", 300, 5 * 60 * 1000, (req) => `general:${req.ip}`);
}
