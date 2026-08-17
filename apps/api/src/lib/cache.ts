import type { Redis } from "ioredis";
import { logger } from "./logger.js";

/**
 * Cache-aside helper for public, non-authoritative data (PRD §13). Postgres
 * remains the source of truth: any Redis error is logged and treated as a
 * cache miss rather than surfaced to the caller, so a Redis outage degrades
 * read latency instead of taking the API down.
 */
export async function cached<T>(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err, key }, "Cache read failed, falling back to source of truth");
  }

  const value = await load();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, "Cache write failed");
  }

  return value;
}

export async function invalidateCache(redis: Redis, ...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, "Cache invalidation failed");
  }
}
