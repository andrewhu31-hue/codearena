import { VERDICTS, type Verdict } from "@codearena/shared";

/**
 * Milestone 2 placeholder judge. Per PRD §12, no submission is ever
 * executed outside a Docker sandbox, and that sandbox doesn't exist until
 * Milestone 3 — so this evaluator does not run submitted code at all. It
 * only exercises the queue → worker → verdict → persistence pipeline
 * end-to-end (retries, idempotency, submission history) so that plumbing
 * can be built and tested now, and is fully replaced by real per-language
 * execution in Milestone 3.
 *
 * The verdict is read from an optional directive on the first line of the
 * source, e.g. `// CODEARENA_VERDICT: WRONG_ANSWER`, so tests and demos can
 * deterministically exercise every verdict path. Source with no directive
 * defaults to ACCEPTED.
 */
const DIRECTIVE_PATTERN = /^\s*(?:\/\/|#)\s*CODEARENA_VERDICT:\s*([A-Z_]+)/;

export interface EvaluatorTestCase {
  id: string;
  input: string;
  expectedOutput: string;
}

export interface EvaluatorTestResult {
  testCaseId: string;
  passed: boolean;
  output: string;
}

export interface EvaluatorResult {
  verdict: Verdict;
  testResults: EvaluatorTestResult[];
}

function directedVerdict(sourceCode: string): Verdict {
  const match = DIRECTIVE_PATTERN.exec(sourceCode);
  const candidate = match?.[1];
  if (candidate && (VERDICTS as readonly string[]).includes(candidate)) {
    return candidate as Verdict;
  }
  return "ACCEPTED";
}

export function evaluateSubmission(
  sourceCode: string,
  testCases: EvaluatorTestCase[],
): EvaluatorResult {
  const verdict = directedVerdict(sourceCode);

  const testResults =
    verdict === "ACCEPTED"
      ? testCases.map((tc) => ({ testCaseId: tc.id, passed: true, output: tc.expectedOutput }))
      : testCases.map((tc) => ({ testCaseId: tc.id, passed: false, output: "" }));

  return { verdict, testResults };
}
