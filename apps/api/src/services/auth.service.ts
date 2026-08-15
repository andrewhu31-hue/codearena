import { prisma, Prisma } from "@codearena/database";
import type { ApiEnv } from "@codearena/config";
import type { AuthResponse, LoginInput, RegisterInput } from "@codearena/shared";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import { generateRefreshToken, hashRefreshToken } from "../lib/refreshToken.js";
import { AppError } from "../lib/AppError.js";

interface IssuedTokens {
  auth: AuthResponse;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function refreshTtlMs(env: ApiEnv): number {
  return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

async function issueTokens(
  env: ApiEnv,
  user: {
    id: string;
    email: string;
    username: string;
    role: "CONTESTANT" | "ADMIN";
    createdAt: Date;
  },
): Promise<IssuedTokens> {
  const accessToken = signAccessToken(env, { sub: user.id, role: user.role });
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTtlMs(env));

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    },
  });

  return {
    auth: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      accessToken,
      accessTokenExpiresAt: new Date(
        Date.now() + env.ACCESS_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
    },
    refreshToken,
    refreshTokenExpiresAt,
  };
}

export async function register(env: ApiEnv, input: RegisterInput): Promise<IssuedTokens> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: { email: input.email, username: input.username, passwordHash },
    });
    return issueTokens(env, user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw AppError.conflict("Email or username is already registered");
    }
    throw err;
  }
}

export async function login(env: ApiEnv, input: LoginInput): Promise<IssuedTokens> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Deliberately generic message either way, so login enumeration doesn't
  // reveal whether an email is registered (PRD §8).
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw AppError.unauthorized();
  }
  return issueTokens(env, user);
}

export async function refresh(env: ApiEnv, presentedToken: string): Promise<IssuedTokens> {
  const tokenHash = hashRefreshToken(presentedToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  // Rotate: revoke the presented token and issue a new pair, so a stolen
  // (and later replayed) refresh token is immediately detectable/void.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(env, stored.user);
}

export async function logout(presentedToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.unauthorized();
  return user;
}
