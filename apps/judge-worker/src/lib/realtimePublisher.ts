import type { Redis } from "ioredis";
import {
  REALTIME_CHANNEL,
  type RealtimeEvent,
  type SubmissionRealtimeEvent,
} from "@codearena/shared";
import { logger } from "./logger.js";

async function publish(redis: Redis, event: RealtimeEvent): Promise<void> {
  try {
    await redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
  } catch (err) {
    logger.warn({ err, event }, "Failed to publish realtime event");
  }
}

export function publishSubmissionUpdate(
  redis: Redis,
  event: Omit<SubmissionRealtimeEvent, "type">,
): Promise<void> {
  return publish(redis, { type: "submission", ...event });
}

export function publishLeaderboardChanged(redis: Redis, contestId: string): Promise<void> {
  return publish(redis, { type: "leaderboard", contestId });
}
