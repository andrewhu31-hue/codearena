import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { Language, Verdict } from "@codearena/shared";
import { LANGUAGE_CONFIG, type LanguageConfig } from "./languages.js";
import { buildRunArgs } from "./dockerArgs.js";
import { runDockerContainer } from "./dockerProcess.js";
import { outputsMatch } from "./outputCompare.js";
import { createWorkspace, cleanupWorkspace, type Workspace } from "./workspace.js";

const COMPILE_TIMEOUT_MS = 10_000;
const COMPILE_MEMORY_MB = 512;
// Generous grace beyond the problem's own limit to absorb container
// start-up overhead, so that isn't mistaken for the solution being slow.
const RUN_TIMEOUT_BUFFER_MS = 2_000;
const MAX_COMPILER_OUTPUT_CHARS = 8_000;
const MAX_STORED_OUTPUT_CHARS = 4_000;

export interface EvaluateTestCase {
  id: string;
  input: string;
  expectedOutput: string;
}

export interface EvaluateSubmissionInput {
  submissionId: string;
  language: Language;
  sourceCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: EvaluateTestCase[];
  /** Base directory to create the per-submission workspace under. Defaults to the OS temp dir. */
  workspaceDir?: string;
  /**
   * Host-visible path for the same base directory. Only needed when
   * judge-worker itself runs inside a container talking to the host's
   * Docker daemon (Docker-outside-of-Docker) — defaults to `workspaceDir`.
   * See docs/judge-security.md.
   */
  workspaceHostDir?: string;
}

export interface EvaluatorTestResult {
  testCaseId: string;
  passed: boolean;
  output: string;
  runtimeMs: number | null;
  memoryKb: number | null;
}

export interface EvaluatorResult {
  verdict: Verdict;
  testResults: EvaluatorTestResult[];
  compilerOutput: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
}

function containerName(kind: "compile" | "run", submissionId: string): string {
  return `codearena-${kind}-${submissionId}-${randomUUID().slice(0, 8)}`;
}

async function compile(
  workspace: Workspace,
  config: LanguageConfig,
  submissionId: string,
): Promise<{ success: boolean; output: string | null }> {
  if (!config.compileCommand) return { success: true, output: null };

  const name = containerName("compile", submissionId);
  const args = buildRunArgs({
    name,
    image: config.image,
    workspaceDir: workspace.hostDir,
    readOnlyWorkspace: false,
    memoryMb: COMPILE_MEMORY_MB,
    command: config.compileCommand,
  });

  const result = await runDockerContainer(args, name, "", COMPILE_TIMEOUT_MS);
  const success = !result.timedOut && !result.oomKilled && result.exitCode === 0;
  if (success) return { success, output: null };

  const message = result.stderr || result.stdout || "Compilation failed";
  return { success, output: message.slice(0, MAX_COMPILER_OUTPUT_CHARS) };
}

async function runOneTestCase(
  workspace: Workspace,
  config: LanguageConfig,
  input: EvaluateSubmissionInput,
  testCase: EvaluateTestCase,
): Promise<EvaluatorTestResult & { verdict: Verdict }> {
  const name = containerName("run", input.submissionId);
  const args = buildRunArgs({
    name,
    image: config.image,
    workspaceDir: workspace.hostDir,
    readOnlyWorkspace: true,
    memoryMb: input.memoryLimitMb,
    command: config.runCommand,
  });

  const result = await runDockerContainer(
    args,
    name,
    testCase.input,
    input.timeLimitMs + RUN_TIMEOUT_BUFFER_MS,
  );

  const base = {
    testCaseId: testCase.id,
    output: result.stdout.slice(0, MAX_STORED_OUTPUT_CHARS),
    runtimeMs: result.runtimeMs,
    memoryKb: result.memoryKb,
  };

  if (result.timedOut) {
    return { ...base, passed: false, verdict: "TIME_LIMIT_EXCEEDED" };
  }
  if (result.oomKilled) {
    return { ...base, passed: false, verdict: "MEMORY_LIMIT_EXCEEDED" };
  }
  // A non-zero exit (or a submission that tried to flood stdout) is a
  // runtime error, not a wrong answer — the program never produced a
  // trustworthy result to compare.
  if (result.outputExceeded || result.exitCode !== 0) {
    return { ...base, passed: false, verdict: "RUNTIME_ERROR" };
  }

  const passed = outputsMatch(result.stdout, testCase.expectedOutput);
  return { ...base, passed, verdict: passed ? "ACCEPTED" : "WRONG_ANSWER" };
}

/**
 * Compiles (if needed) and runs a submission against its test cases inside
 * Docker sandboxes (PRD §12) — see docs/judge-security.md for the full
 * isolation model and its limitations. Stops at the first failing test,
 * matching most online judges, rather than always running every test.
 */
export async function evaluateSubmission(input: EvaluateSubmissionInput): Promise<EvaluatorResult> {
  const config = LANGUAGE_CONFIG[input.language];
  const containerBaseDir = input.workspaceDir ?? tmpdir();
  const hostBaseDir = input.workspaceHostDir ?? containerBaseDir;
  const workspace = await createWorkspace(
    input.submissionId,
    config.sourceFilename,
    input.sourceCode,
    containerBaseDir,
    hostBaseDir,
  );

  try {
    if (config.needsCompile) {
      const compileResult = await compile(workspace, config, input.submissionId);
      if (!compileResult.success) {
        return {
          verdict: "COMPILATION_ERROR",
          testResults: [],
          compilerOutput: compileResult.output,
          runtimeMs: null,
          memoryKb: null,
        };
      }
    }

    const testResults: EvaluatorTestResult[] = [];
    let verdict: Verdict = "ACCEPTED";
    let maxRuntimeMs: number | null = null;
    let maxMemoryKb: number | null = null;

    for (const testCase of input.testCases) {
      const result = await runOneTestCase(workspace, config, input, testCase);
      const { verdict: testVerdict, ...testResult } = result;
      testResults.push(testResult);

      if (testResult.runtimeMs !== null) {
        maxRuntimeMs = Math.max(maxRuntimeMs ?? 0, testResult.runtimeMs);
      }
      if (testResult.memoryKb !== null) {
        maxMemoryKb = Math.max(maxMemoryKb ?? 0, testResult.memoryKb);
      }

      if (!testResult.passed) {
        verdict = testVerdict;
        break;
      }
    }

    return {
      verdict,
      testResults,
      compilerOutput: null,
      runtimeMs: maxRuntimeMs,
      memoryKb: maxMemoryKb,
    };
  } finally {
    await cleanupWorkspace(workspace);
  }
}
