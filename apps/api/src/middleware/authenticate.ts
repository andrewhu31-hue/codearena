import type { NextFunction, Request, Response } from "express";
import type { ApiEnv } from "@codearena/config";
import type { Role } from "@codearena/shared";
import { verifyAccessToken } from "../lib/jwt.js";
import { AppError } from "../lib/AppError.js";

export function authenticate(env: ApiEnv) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      next(AppError.unauthorized("Authentication required"));
      return;
    }

    try {
      req.auth = verifyAccessToken(env, header.slice("Bearer ".length));
      next();
    } catch {
      next(AppError.unauthorized("Invalid or expired access token"));
    }
  };
}

/**
 * Attaches `req.auth` when a valid token is present, but never rejects —
 * for endpoints that are public but personalize their response for a
 * logged-in caller (e.g. contest listings showing private contests the
 * caller is registered for).
 */
export function optionalAuthenticate(env: ApiEnv) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    if (header?.startsWith("Bearer ")) {
      try {
        req.auth = verifyAccessToken(env, header.slice("Bearer ".length));
      } catch {
        // Invalid/expired token on an optional-auth route: proceed as anonymous.
      }
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
