import jwt from "jsonwebtoken";
import type { ApiEnv } from "@codearena/config";
import type { Role } from "@codearena/shared";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(env: ApiEnv, payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(env: ApiEnv, token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}
