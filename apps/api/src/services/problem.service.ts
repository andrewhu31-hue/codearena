import type { Redis } from "ioredis";
import { prisma, Prisma } from "@codearena/database";
import type {
  CreateProblemInput,
  Difficulty,
  Language,
  ProblemDetail,
  ProblemExample,
  ProblemSummary,
  UpdateProblemInput,
} from "@codearena/shared";
import { AppError } from "../lib/AppError.js";
import { cached, invalidateCache } from "../lib/cache.js";

const LIST_CACHE_KEY = "problems:list";
const detailCacheKey = (slug: string): string => `problems:detail:${slug}`;

interface ProblemRecord {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  supportedLanguages: string[];
}

function toSummary(problem: ProblemRecord): ProblemSummary {
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty as Difficulty,
    supportedLanguages: problem.supportedLanguages as Language[],
  };
}

interface ProblemDetailRecord extends ProblemRecord {
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: Prisma.JsonValue;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: { input: string; expectedOutput: string }[];
}

function toDetail(problem: ProblemDetailRecord): ProblemDetail {
  return {
    ...toSummary(problem),
    description: problem.description,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    examples: (problem.examples as ProblemExample[] | null) ?? [],
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    sampleTests: problem.testCases,
  };
}

export async function listProblems(redis: Redis, ttlSeconds: number): Promise<ProblemSummary[]> {
  return cached(redis, LIST_CACHE_KEY, ttlSeconds, async () => {
    const problems = await prisma.problem.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, title: true, difficulty: true, supportedLanguages: true },
    });
    return problems.map(toSummary);
  });
}

export async function getProblemDetail(
  redis: Redis,
  ttlSeconds: number,
  slug: string,
): Promise<ProblemDetail> {
  return cached(redis, detailCacheKey(slug), ttlSeconds, async () => {
    const problem = await prisma.problem.findUnique({
      where: { slug },
      include: {
        testCases: {
          where: { isSample: true },
          orderBy: { createdAt: "asc" },
          select: { input: true, expectedOutput: true },
        },
      },
    });
    if (!problem) throw AppError.notFound("Problem not found");
    return toDetail(problem);
  });
}

/** Internal lookup for the submission flow: needs the full row, not the cached public view. */
export async function getProblemForSubmission(problemId: string) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      slug: true,
      supportedLanguages: true,
      _count: { select: { testCases: true } },
    },
  });
  if (!problem) throw AppError.notFound("Problem not found");
  return problem;
}

export async function createProblem(
  redis: Redis,
  input: CreateProblemInput,
): Promise<ProblemDetail> {
  try {
    const problem = await prisma.problem.create({
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        inputFormat: input.inputFormat,
        outputFormat: input.outputFormat,
        constraints: input.constraints,
        examples: input.examples as Prisma.InputJsonValue,
        difficulty: input.difficulty,
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
        supportedLanguages: input.supportedLanguages,
        testCases: {
          create: [
            ...input.sampleTests.map((t) => ({ ...t, isSample: true })),
            ...input.hiddenTests.map((t) => ({ ...t, isSample: false })),
          ],
        },
      },
      include: {
        testCases: {
          where: { isSample: true },
          select: { input: true, expectedOutput: true },
        },
      },
    });
    await invalidateCache(redis, LIST_CACHE_KEY);
    return toDetail(problem);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw AppError.conflict("A problem with this slug already exists");
    }
    throw err;
  }
}

export async function updateProblem(
  redis: Redis,
  id: string,
  input: UpdateProblemInput,
): Promise<ProblemDetail> {
  const existing = await prisma.problem.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) throw AppError.notFound("Problem not found");

  const { sampleTests, hiddenTests, examples, ...scalarUpdates } = input;

  const problem = await prisma.$transaction(async (tx) => {
    if (sampleTests) {
      await tx.testCase.deleteMany({ where: { problemId: id, isSample: true } });
      if (sampleTests.length > 0) {
        await tx.testCase.createMany({
          data: sampleTests.map((t) => ({ ...t, problemId: id, isSample: true })),
        });
      }
    }
    if (hiddenTests) {
      await tx.testCase.deleteMany({ where: { problemId: id, isSample: false } });
      if (hiddenTests.length > 0) {
        await tx.testCase.createMany({
          data: hiddenTests.map((t) => ({ ...t, problemId: id, isSample: false })),
        });
      }
    }
    return tx.problem.update({
      where: { id },
      data: {
        ...scalarUpdates,
        ...(examples !== undefined ? { examples: examples as Prisma.InputJsonValue } : {}),
      },
      include: {
        testCases: {
          where: { isSample: true },
          select: { input: true, expectedOutput: true },
        },
      },
    });
  });

  await invalidateCache(redis, LIST_CACHE_KEY, detailCacheKey(existing.slug));
  return toDetail(problem);
}
