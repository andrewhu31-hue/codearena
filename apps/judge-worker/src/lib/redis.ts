import { Redis } from "ioredis";
import type { JudgeWorkerEnv } from "@codearena/config";

export function createRedisClient(env: JudgeWorkerEnv): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
}
