import { z } from "zod";
import { LANGUAGES } from "./problems.js";

/**
 * AI study aids. Two features, both deliberately bounded:
 *
 * - Progressive hints for a problem: unlocked in order (1 → 2 → 3), never
 *   containing code, and generated from the public statement + sample tests
 *   only (hidden tests are never sent to the model).
 * - A code review of a submission that was already ACCEPTED.
 *
 * Both are unavailable for any problem that is part of a contest which has
 * not ended yet (upcoming or live), so they can't be used to gain an edge.
 */

export const HINT_LEVELS = [1, 2, 3] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];

export const HINT_LEVEL_LABELS: Record<HintLevel, string> = {
  1: "Nudge",
  2: "Approach",
  3: "Walkthrough",
};

export const HINT_LEVEL_DESCRIPTIONS: Record<HintLevel, string> = {
  1: "A gentle push in the right direction: what to notice about the problem.",
  2: "The key idea or technique, and why it works here.",
  3: "Step-by-step outline of the algorithm, with complexity. Still no code.",
};

export const requestHintSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type RequestHintInput = z.infer<typeof requestHintSchema>;

export interface ProblemHint {
  level: HintLevel;
  label: string;
  content: string;
}

export interface ProblemHintsResponse {
  problemId: string;
  /** Hints this user has unlocked, in level order. */
  hints: ProblemHint[];
  /** Next level that can be unlocked, or null when all are unlocked. */
  nextLevel: HintLevel | null;
  /** Why hints can't be used right now, if they can't (e.g. a live contest). */
  blockedReason: string | null;
}

export const codeReviewSchema = z.object({
  summary: z.string().min(1).max(2000),
  timeComplexity: z.string().min(1).max(200),
  spaceComplexity: z.string().min(1).max(200),
  strengths: z.array(z.string().min(1).max(500)).max(6),
  improvements: z.array(z.string().min(1).max(800)).max(8),
  alternativeApproach: z.string().max(2000).nullable(),
});
export type CodeReview = z.infer<typeof codeReviewSchema>;

export interface CodeReviewResponse {
  submissionId: string;
  review: CodeReview;
  model: string;
  createdAt: string;
}

export interface AiStatusResponse {
  enabled: boolean;
}

export const AI_LANGUAGE_NAMES: Record<(typeof LANGUAGES)[number], string> = {
  PYTHON: "Python",
  JAVASCRIPT: "JavaScript",
  CPP: "C++",
};
