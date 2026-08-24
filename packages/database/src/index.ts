import { PrismaClient } from "@prisma/client";
import { assertDedicatedTestDatabase } from "./testDatabaseSafety.js";

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * A single PrismaClient per process. In dev, Next.js/tsx hot-reload can
 * otherwise create a new client (and connection pool) on every reload.
 */
export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV === "test") {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for tests");
  }
  assertDedicatedTestDatabase(databaseUrl, "Prisma test environment initialization");
}

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export * from "@prisma/client";
export * from "./testDatabaseSafety.js";
