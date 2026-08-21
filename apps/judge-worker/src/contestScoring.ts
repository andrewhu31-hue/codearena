import type { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import { computeContestScore } from "@codearena/shared";
import { publishLeaderboardChanged } from "./lib/realtimePublisher.js";
import { logger } from "./lib/logger.js";

// Generous headroom over realistic penalty-minute values so the primary
// sort (score) always dominates the secondary sort (penalty) in the Redis
// ZSET — mirrors apps/api/src/services/contest.service.ts, which reads
// this same cache.
const PENALTY_TIEBREAK_MULTIPLIER = 1_000_000_000;

function leaderboardKey(contestId: string): string {
  return `leaderboard:${contestId}`;
}

function combinedScore(score: number, penaltyMs: number): number {
  const penaltyMinutes = Math.floor(penaltyMs / 60_000);
  return score * PENALTY_TIEBREAK_MULTIPLIER - penaltyMinutes;
}

/**
 * Recomputes one user's score for one contest from scratch (PRD §11: "A
 * retry must not create duplicate submissions or scores" — recomputing
 * from all of their judged submissions is idempotent by construction,
 * unlike an incremental update). Called after every contest submission is
 * judged. Keeps Postgres's `ContestScore` authoritative and the Redis
 * ranking cache in sync; a Redis failure here is logged and swallowed
 * rather than failing the job, since the leaderboard read path rebuilds
 * the cache from Postgres on demand.
 */
export async function recomputeContestScore(
  redis: Redis,
  contestId: string,
  userId: string,
): Promise<void> {
  const [contest, contestProblems, submissions] = await Promise.all([
    prisma.contest.findUniqueOrThrow({ where: { id: contestId } }),
    prisma.contestProblem.findMany({
      where: { contestId },
      select: { problemId: true, points: true },
    }),
    prisma.submission.findMany({
      where: { contestId, userId, status: "COMPLETED" },
      select: { problemId: true, verdict: true, createdAt: true },
    }),
  ]);

  const result = computeContestScore(contestProblems, submissions, contest.startTime);

  await prisma.contestScore.upsert({
    where: { contestId_userId: { contestId, userId } },
    update: { score: result.score, solvedCount: result.solvedCount, penaltyMs: result.penaltyMs },
    create: {
      contestId,
      userId,
      score: result.score,
      solvedCount: result.solvedCount,
      penaltyMs: result.penaltyMs,
    },
  });

  try {
    await redis.zadd(
      leaderboardKey(contestId),
      combinedScore(result.score, result.penaltyMs),
      userId,
    );
  } catch (err) {
    logger.warn(
      { err, contestId, userId },
      "Failed to update leaderboard cache; will be rebuilt on next read",
    );
  }

  await publishLeaderboardChanged(redis, contestId);
}
