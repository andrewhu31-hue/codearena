import { Redis } from "ioredis";
import type { ApiEnv } from "@codearena/config";

export function createRedisClient(env: ApiEnv): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
}
