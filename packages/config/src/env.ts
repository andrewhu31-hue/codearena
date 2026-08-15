import { z } from "zod";

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

let cachedApiEnv: ApiEnv | undefined;

/**
 * Parses and validates process.env once, on first use, and caches the result.
 * Fails fast with a readable message instead of letting bad config surface
 * later as a confusing runtime error.
 */
export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  if (cachedApiEnv) return cachedApiEnv;

  const parsed = apiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cachedApiEnv = parsed.data;
  return cachedApiEnv;
}
