import type { Request, Response } from "express";
import type { ApiEnv } from "@codearena/config";
import { loginSchema, registerSchema } from "@codearena/shared";
import * as authService from "../services/auth.service.js";
import { AppError } from "../lib/AppError.js";

const REFRESH_COOKIE = "refreshToken";

function refreshCookieOptions(env: ApiEnv, expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/v1/auth",
    expires: expiresAt,
  };
}

export function createAuthController(env: ApiEnv) {
  return {
    async register(req: Request, res: Response) {
      const input = registerSchema.parse(req.body);
      const { auth, refreshToken, refreshTokenExpiresAt } = await authService.register(env, input);
      res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(env, refreshTokenExpiresAt));
      res.status(201).json(auth);
    },

    async login(req: Request, res: Response) {
      const input = loginSchema.parse(req.body);
      const { auth, refreshToken, refreshTokenExpiresAt } = await authService.login(env, input);
      res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(env, refreshTokenExpiresAt));
      res.status(200).json(auth);
    },

    async refresh(req: Request, res: Response) {
      const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (!presented) throw AppError.unauthorized("Missing refresh token");

      const { auth, refreshToken, refreshTokenExpiresAt } = await authService.refresh(
        env,
        presented,
      );
      res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(env, refreshTokenExpiresAt));
      res.status(200).json(auth);
    },

    async logout(req: Request, res: Response) {
      const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (presented) await authService.logout(presented);
      res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
      res.status(204).send();
    },

    async me(req: Request, res: Response) {
      if (!req.auth) throw AppError.unauthorized();
      const user = await authService.getUserById(req.auth.sub);
      res.status(200).json({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      });
    },
  };
}
