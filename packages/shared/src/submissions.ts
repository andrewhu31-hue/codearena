import { z } from "zod";
import { LANGUAGES, type Language } from "./problems.js";

export const SUBMISSION_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const VERDICTS = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
  "INTERNAL_ERROR",
] as const;
export type Verdict = (typeof VERDICTS)[number];

// Bounded well under the API's 256kb JSON body limit, and far beyond any
// legitimate solution, so oversized payloads are rejected before they reach
// the queue or database.
const MAX_SOURCE_CODE_LENGTH = 65_536;

export const createSubmissionSchema = z.object({
  problemId: z.string().uuid(),
  contestId: z.string().uuid().optional(),
  language: z.enum(LANGUAGES),
  sourceCode: z.string().trim().min(1).max(MAX_SOURCE_CODE_LENGTH),
});
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export interface SubmissionSummary {
  id: string;
  problemId: string;
  problemSlug: string;
  problemTitle: string;
  language: Language;
  status: SubmissionStatus;
  verdict: Verdict | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  testsPassed: number;
  testsTotal: number;
  createdAt: string;
}

export interface SubmissionDetail extends SubmissionSummary {
  sourceCode: string;
  compilerOutput: string | null;
}

export interface SubmissionListResponse {
  submissions: SubmissionSummary[];
  page: number;
  pageSize: number;
  total: number;
}
