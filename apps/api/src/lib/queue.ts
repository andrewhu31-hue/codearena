import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { ApiEnv } from "@codearena/config";
import { resolveSubmissionQueueName } from "@codearena/shared";

export interface SubmissionQueueHandle {
  queue: Queue;
  connection: Redis;
}

/**
 * BullMQ requires its own connection with `maxRetriesPerRequest: null`
 * (blocking commands otherwise fail); kept separate from the general-purpose
 * Redis client used for caching and rate limiting.
 */
export function createSubmissionQueue(env: ApiEnv): SubmissionQueueHandle {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(resolveSubmissionQueueName(), { connection });
  return { queue, connection };
}
