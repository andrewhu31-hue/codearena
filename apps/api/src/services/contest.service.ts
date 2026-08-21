import type { Redis } from "ioredis";
import { prisma, Prisma } from "@codearena/database";
import {
  computeContestScore,
  type ContestDetail,
  type ContestProblemSummary,
  type ContestStatus,
  type ContestSummary,
  type ContestVisibility,
  type CreateContestInput,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type Role,
  type UpdateContestInput,
} from "@codearena/shared";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

const LEADERBOARD_LIMIT = 100;
// Generous headroom over realistic penalty-minute values so the primary
// sort (score) always dominates the secondary sort (penalty) — see
// combinedScore().
const PENALTY_TIEBREAK_MULTIPLIER = 1_000_000_000;

function leaderboardKey(contestId: string): string {
  return `leaderboard:${contestId}`;
}

function combinedScore(score: number, penaltyMs: number): number {
  const penaltyMinutes = Math.floor(penaltyMs / 60_000);
  return score * PENALTY_TIEBREAK_MULTIPLIER - penaltyMinutes;
}

function computeStatus(startTime: Date, endTime: Date): ContestStatus {
  const now = new Date();
  if (now < startTime) return "UPCOMING";
  if (now > endTime) return "ENDED";
  return "ACTIVE";
}

interface ContestRecord {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  visibility: string;
}

function toSummary(contest: ContestRecord): ContestSummary {
  return {
    id: contest.id,
    name: contest.name,
    startTime: contest.startTime.toISOString(),
    endTime: contest.endTime.toISOString(),
    visibility: contest.visibility as ContestVisibility,
    status: computeStatus(contest.startTime, contest.endTime),
  };
}

interface ContestDetailRecord extends ContestRecord {
  description: string;
  contestProblems: {
    problemId: string;
    points: number;
    order: number;
    problem: { slug: string; title: string };
  }[];
}

function toDetail(contest: ContestDetailRecord, isRegistered: boolean): ContestDetail {
  const problems: ContestProblemSummary[] = contest.contestProblems.map((cp) => ({
    problemId: cp.problemId,
    slug: cp.problem.slug,
    title: cp.problem.title,
    points: cp.points,
    order: cp.order,
  }));
  return { ...toSummary(contest), description: contest.description, problems, isRegistered };
}

const CONTEST_PROBLEMS_INCLUDE = {
  contestProblems: {
    orderBy: { order: "asc" as const },
    include: { problem: { select: { slug: true, title: true } } },
  },
};

export async function listContests(role: Role | undefined): Promise<ContestSummary[]> {
  const contests = await prisma.contest.findMany({
    where: role === "ADMIN" ? {} : { visibility: "PUBLIC" },
    orderBy: { startTime: "desc" },
  });
  return contests.map(toSummary);
}

export async function getContestDetail(
  id: string,
  userId: string | undefined,
  role: Role | undefined,
): Promise<ContestDetail> {
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: CONTEST_PROBLEMS_INCLUDE,
  });
  if (!contest) throw AppError.notFound("Contest not found");

  const isRegistered = userId
    ? Boolean(
        await prisma.contestRegistration.findUnique({
          where: { contestId_userId: { contestId: id, userId } },
        }),
      )
    : false;

  if (contest.visibility === "PRIVATE" && role !== "ADMIN" && !isRegistered) {
    // Same response as a nonexistent contest: don't reveal that a private
    // contest exists to users who aren't part of it.
    throw AppError.notFound("Contest not found");
  }

  return toDetail(contest, isRegistered);
}

export async function createContest(input: CreateContestInput): Promise<ContestDetail> {
  try {
    const contest = await prisma.contest.create({
      data: {
        name: input.name,
        description: input.description,
        startTime: input.startTime,
        endTime: input.endTime,
        visibility: input.visibility,
        contestProblems: { create: input.problems },
      },
      include: CONTEST_PROBLEMS_INCLUDE,
    });
    return toDetail(contest, false);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw AppError.validation("One or more problemIds do not exist");
    }
    throw err;
  }
}

export async function updateContest(id: string, input: UpdateContestInput): Promise<ContestDetail> {
  const existing = await prisma.contest.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Contest not found");

  const { problems, ...scalarUpdates } = input;

  try {
    const contest = await prisma.$transaction(async (tx) => {
      if (problems) {
        await tx.contestProblem.deleteMany({ where: { contestId: id } });
        if (problems.length > 0) {
          await tx.contestProblem.createMany({
            data: problems.map((p) => ({ ...p, contestId: id })),
          });
        }
      }
      return tx.contest.update({
        where: { id },
        data: scalarUpdates,
        include: CONTEST_PROBLEMS_INCLUDE,
      });
    });
    return toDetail(contest, false);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw AppError.validation("One or more problemIds do not exist");
    }
    throw err;
  }
}

export async function registerForContest(contestId: string, userId: string): Promise<void> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) throw AppError.notFound("Contest not found");
  if (new Date() > contest.endTime) throw AppError.validation("Contest has already ended");

  try {
    await prisma.contestRegistration.create({ data: { contestId, userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw AppError.conflict("Already registered for this contest");
    }
    throw err;
  }
}

/** Rebuilds the Redis ranking cache from Postgres — the authoritative source (PRD §13). */
export async function rebuildLeaderboardCache(redis: Redis, contestId: string): Promise<void> {
  const scores = await prisma.contestScore.findMany({ where: { contestId } });
  const key = leaderboardKey(contestId);
  await redis.del(key);
  if (scores.length === 0) return;

  const args: (string | number)[] = [];
  for (const s of scores) args.push(combinedScore(s.score, s.penaltyMs), s.userId);
  await redis.zadd(key, ...args);
}

export async function getLeaderboard(
  redis: Redis,
  contestId: string,
): Promise<LeaderboardResponse> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) throw AppError.notFound("Contest not found");

  let userIds: string[] | null = null;
  try {
    userIds = await redis.zrevrange(leaderboardKey(contestId), 0, LEADERBOARD_LIMIT - 1);
    if (userIds.length === 0) {
      // Ambiguous: genuinely no scores yet, or the cache is missing/evicted.
      // Postgres is authoritative, so rebuilding and re-reading is always safe.
      await rebuildLeaderboardCache(redis, contestId);
      userIds = await redis.zrevrange(leaderboardKey(contestId), 0, LEADERBOARD_LIMIT - 1);
    }
  } catch (err) {
    logger.warn({ err, contestId }, "Leaderboard cache read failed, falling back to Postgres");
    userIds = null;
  }

  const orderedUserIds =
    userIds ??
    (
      await prisma.contestScore.findMany({
        where: { contestId },
        orderBy: [{ score: "desc" }, { penaltyMs: "asc" }],
        take: LEADERBOARD_LIMIT,
        select: { userId: true },
      })
    ).map((r) => r.userId);

  if (orderedUserIds.length === 0) return { contestId, entries: [] };

  const contestProblems = await prisma.contestProblem.findMany({
    where: { contestId },
    select: { problemId: true, points: true },
  });

  const [scoreRows, submissionRows] = await Promise.all([
    prisma.contestScore.findMany({
      where: { contestId, userId: { in: orderedUserIds } },
      include: { user: { select: { username: true } } },
    }),
    prisma.submission.findMany({
      where: { contestId, userId: { in: orderedUserIds }, status: "COMPLETED" },
      select: { userId: true, problemId: true, verdict: true, createdAt: true },
    }),
  ]);

  const scoreByUser = new Map(scoreRows.map((r) => [r.userId, r]));
  const submissionsByUser = new Map<string, typeof submissionRows>();
  for (const row of submissionRows) {
    const list = submissionsByUser.get(row.userId) ?? [];
    list.push(row);
    submissionsByUser.set(row.userId, list);
  }

  const entries: LeaderboardEntry[] = orderedUserIds.map((userId, index) => {
    const scoreRow = scoreByUser.get(userId);
    const breakdown = computeContestScore(
      contestProblems,
      submissionsByUser.get(userId) ?? [],
      contest.startTime,
    );
    return {
      rank: index + 1,
      userId,
      username: scoreRow?.user.username ?? "unknown",
      score: scoreRow?.score ?? breakdown.score,
      solvedCount: scoreRow?.solvedCount ?? breakdown.solvedCount,
      penaltyMs: scoreRow?.penaltyMs ?? breakdown.penaltyMs,
      problems: breakdown.problems,
    };
  });

  return { contestId, entries };
}
