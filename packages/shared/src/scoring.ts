import type { Verdict } from "./submissions.js";

export const PENALTY_MINUTES_PER_WRONG_ATTEMPT = 20;

// Verdicts that count as a scored "wrong" attempt toward penalty time.
// Compilation/internal errors are excluded — the submission never really
// ran, matching the common ICPC-style convention that those aren't a
// meaningful attempt.
const PENALIZED_VERDICTS = new Set<Verdict>([
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
]);

export interface ScoringSubmission {
  problemId: string;
  verdict: Verdict | null;
  createdAt: Date;
}

export interface ScoringProblem {
  problemId: string;
  points: number;
}

export interface ProblemScoreResult {
  problemId: string;
  attempts: number;
  solved: boolean;
  penaltyMinutes: number | null;
}

export interface ContestScoreResult {
  score: number;
  solvedCount: number;
  penaltyMs: number;
  problems: ProblemScoreResult[];
}

/**
 * ICPC-style scoring: for each contest problem, only the first ACCEPTED
 * submission (in chronological order) counts — everything after it is
 * ignored, including resubmissions. Each penalized attempt before that
 * acceptance adds a fixed penalty in minutes. `submissions` should already
 * be filtered to this contest and this user, and to submissions with a
 * final verdict (a QUEUED/RUNNING one can't be scored yet).
 *
 * Deterministic and idempotent: recomputing from the same submissions
 * always yields the same result, so callers can safely recompute from
 * scratch on every change rather than update incrementally.
 */
export function computeContestScore(
  contestProblems: ScoringProblem[],
  submissions: ScoringSubmission[],
  contestStartTime: Date,
): ContestScoreResult {
  const submissionsByProblem = new Map<string, ScoringSubmission[]>();
  for (const submission of submissions) {
    const list = submissionsByProblem.get(submission.problemId) ?? [];
    list.push(submission);
    submissionsByProblem.set(submission.problemId, list);
  }

  let score = 0;
  let solvedCount = 0;
  let penaltyMs = 0;
  const problems: ProblemScoreResult[] = [];

  for (const contestProblem of contestProblems) {
    const problemSubmissions = [...(submissionsByProblem.get(contestProblem.problemId) ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    let attempts = 0;
    let wrongCount = 0;
    let solved = false;
    let penaltyMinutes: number | null = null;

    for (const submission of problemSubmissions) {
      attempts += 1;
      if (submission.verdict === "ACCEPTED") {
        solved = true;
        const minutesFromStart = Math.max(
          0,
          (submission.createdAt.getTime() - contestStartTime.getTime()) / 60_000,
        );
        penaltyMinutes = minutesFromStart + wrongCount * PENALTY_MINUTES_PER_WRONG_ATTEMPT;
        score += contestProblem.points;
        solvedCount += 1;
        penaltyMs += Math.round(penaltyMinutes * 60_000);
        break;
      }
      if (submission.verdict && PENALIZED_VERDICTS.has(submission.verdict)) {
        wrongCount += 1;
      }
    }

    problems.push({ problemId: contestProblem.problemId, attempts, solved, penaltyMinutes });
  }

  return { score, solvedCount, penaltyMs, problems };
}
