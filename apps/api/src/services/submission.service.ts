import type { Queue } from "bullmq";
import { prisma } from "@codearena/database";
import type {
  CreateSubmissionInput,
  Language,
  Role,
  SubmissionDetail,
  SubmissionListResponse,
  SubmissionStatus,
  SubmissionSummary,
  Verdict,
} from "@codearena/shared";
import { AppError } from "../lib/AppError.js";
import * as problemService from "./problem.service.js";

const SUBMISSION_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
};

interface SubmissionRecord {
  id: string;
  problemId: string;
  language: string;
  status: string;
  verdict: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  testsPassed: number;
  testsTotal: number;
  createdAt: Date;
  problem: { slug: string; title: string };
}

export interface SubmissionCreateTimings {
  idempotencyLookupMs: number;
  dbInsertMs: number;
  queueAddMs: number;
}

export interface CreateSubmissionResult {
  submission: SubmissionSummary;
  created: boolean;
  timings: SubmissionCreateTimings;
}

function toSummary(row: SubmissionRecord): SubmissionSummary {
  return {
    id: row.id,
    problemId: row.problemId,
    problemSlug: row.problem.slug,
    problemTitle: row.problem.title,
    language: row.language as Language,
    status: row.status as SubmissionStatus,
    verdict: row.verdict as Verdict | null,
    runtimeMs: row.runtimeMs,
    memoryKb: row.memoryKb,
    testsPassed: row.testsPassed,
    testsTotal: row.testsTotal,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(
  row: SubmissionRecord & { sourceCode: string; compilerOutput: string | null },
): SubmissionDetail {
  return { ...toSummary(row), sourceCode: row.sourceCode, compilerOutput: row.compilerOutput };
}

const PROBLEM_SELECT = { problem: { select: { slug: true, title: true } } } as const;

/**
 * The server is the sole authority on contest timing (PRD §14: "client
 * timers are display-only") — a submission outside the contest window, to
 * a problem not in the contest, or from an unregistered user is rejected
 * here regardless of what the client believes.
 */
async function validateContestSubmission(
  contestId: string,
  problemId: string,
  userId: string,
): Promise<void> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) throw AppError.notFound("Contest not found");

  const now = new Date();
  if (now < contest.startTime || now > contest.endTime) {
    throw AppError.validation("Contest is not currently active");
  }

  const registration = await prisma.contestRegistration.findUnique({
    where: { contestId_userId: { contestId, userId } },
  });
  if (!registration) throw AppError.validation("Register for the contest before submitting");

  const contestProblem = await prisma.contestProblem.findUnique({
    where: { contestId_problemId: { contestId, problemId } },
  });
  if (!contestProblem) throw AppError.validation("This problem is not part of the contest");
}

export async function createSubmission(
  queue: Queue,
  userId: string,
  input: CreateSubmissionInput,
  options?: { idempotencyKey?: string },
): Promise<CreateSubmissionResult> {
  const timings: SubmissionCreateTimings = {
    idempotencyLookupMs: 0,
    dbInsertMs: 0,
    queueAddMs: 0,
  };

  const problem = await problemService.getProblemForSubmission(input.problemId);
  if (!problem.supportedLanguages.includes(input.language)) {
    throw AppError.validation(`${input.language} is not supported for this problem`);
  }

  if (input.contestId) {
    await validateContestSubmission(input.contestId, input.problemId, userId);
  }

  const idempotencyKey = options?.idempotencyKey?.trim();
  const idempotencyScope = input.contestId ? `contest:${input.contestId}` : `practice:${input.problemId}`;

  if (idempotencyKey) {
    const lookupStartedAt = Date.now();
    const existing = await prisma.submission.findFirst({
      where: { userId, idempotencyKey, idempotencyScope },
      include: PROBLEM_SELECT,
      orderBy: { createdAt: "desc" },
    });
    timings.idempotencyLookupMs += Date.now() - lookupStartedAt;
    if (existing) {
      return { submission: toSummary(existing), created: false, timings };
    }
  }

  let submission;
  try {
    const insertStartedAt = Date.now();
    submission = await prisma.submission.create({
      data: {
        userId,
        problemId: input.problemId,
        contestId: input.contestId,
        language: input.language,
        sourceCode: input.sourceCode,
        testsTotal: problem._count.testCases,
        idempotencyKey,
        idempotencyScope: idempotencyKey ? idempotencyScope : null,
      },
      include: PROBLEM_SELECT,
    });
    timings.dbInsertMs = Date.now() - insertStartedAt;
  } catch (error) {
    if (idempotencyKey && typeof error === "object" && error && "code" in error) {
      const knownCode = (error as { code?: string }).code;
      if (knownCode === "P2002") {
        const conflictLookupStartedAt = Date.now();
        const existing = await prisma.submission.findFirst({
          where: { userId, idempotencyKey, idempotencyScope },
          include: PROBLEM_SELECT,
          orderBy: { createdAt: "desc" },
        });
        timings.idempotencyLookupMs += Date.now() - conflictLookupStartedAt;
        if (existing) {
          return { submission: toSummary(existing), created: false, timings };
        }
      }
    }
    throw error;
  }

  // Queue jobs carry only the submission ID (PRD §7); the worker re-reads
  // source and test cases from Postgres, which stays authoritative.
  // jobId = submission.id gives BullMQ built-in duplicate-job prevention.
  const queueAddStartedAt = Date.now();
  await queue.add(
    "evaluate",
    { submissionId: submission.id },
    { ...SUBMISSION_JOB_OPTS, jobId: submission.id },
  );
  timings.queueAddMs = Date.now() - queueAddStartedAt;

  // Guarded update: set only once to preserve immutable lifecycle semantics.
  await prisma.$executeRaw`
    UPDATE submissions
    SET "enqueuedAt" = COALESCE("enqueuedAt", NOW())
    WHERE id = ${submission.id}
  `;

  return { submission: toSummary(submission), created: true, timings };
}

export async function getSubmissionById(
  userId: string,
  role: Role,
  id: string,
): Promise<SubmissionDetail> {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: PROBLEM_SELECT,
  });
  if (!submission) throw AppError.notFound("Submission not found");
  if (submission.userId !== userId && role !== "ADMIN") throw AppError.forbidden();
  return toDetail(submission);
}

export async function listMySubmissions(
  userId: string,
  page: number,
  pageSize: number,
): Promise<SubmissionListResponse> {
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: PROBLEM_SELECT,
    }),
    prisma.submission.count({ where: { userId } }),
  ]);

  return { submissions: submissions.map(toSummary), page, pageSize, total };
}
