import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Language, Verdict } from "@codearena/shared";
import { LANGUAGE_CONFIG, type LanguageConfig } from "./languages.js";
import { buildRunArgs } from "./dockerArgs.js";
import { runDockerContainer, type TimeoutCategory } from "./dockerProcess.js";
import { outputsMatch } from "./outputCompare.js";
import { createWorkspace, cleanupWorkspace, type Workspace } from "./workspace.js";
import { wrapCppSubmission } from "./cpp/generate.js";

const COMPILE_TIMEOUT_MS = 10_000;
const COMPILE_MEMORY_MB = 512;
const RUN_STARTUP_TIMEOUT_MS = 60_000;
const RUN_TEARDOWN_TIMEOUT_MS = 5_000;
const PYTHON_HARNESS_MAX_IO_CHARS = 4_000;
const MAX_COMPILER_OUTPUT_CHARS = 8_000;
const MAX_STORED_OUTPUT_CHARS = 4_000;

export interface EvaluateTestCase {
  id: string;
  input: string;
  expectedOutput: string;
}

export interface EvaluateSubmissionInput {
  submissionId: string;
  problemSlug?: string;
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
  stderr?: string;
  exitCode?: number | null;
  exitSignal?: number | null;
  timedOut?: boolean;
  timeoutCategory?: TimeoutCategory;
}

export interface EvaluatorResult {
  verdict: Verdict;
  testResults: EvaluatorTestResult[];
  compilerOutput: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
  timeoutCategoryCounts?: Partial<Record<TimeoutCategory, number>>;
  startupMs?: number | null;
  teardownMs?: number | null;
  wallTimeMs?: number | null;
  contestantTotalRuntimeMs?: number | null;
}

export function verdictForTimeoutCategory(category: TimeoutCategory): Verdict | null {
  if (category === "contestant_timeout") return "TIME_LIMIT_EXCEEDED";
  if (category === "startup_timeout" || category === "teardown_timeout") return "INTERNAL_ERROR";
  return null;
}

interface HarnessPayload {
  sourcePath: string;
  timeLimitMs: number;
  maxIoChars: number;
  tests: Array<{ id: string; input: string; expectedOutput: string }>;
}

interface HarnessTestResult {
  testId: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exitSignal: number | null;
  runtimeMs: number;
  timedOut: boolean;
  memoryKb: number | null;
  verdict: "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED" | "RUNTIME_ERROR" | "INTERNAL_ERROR";
}

interface HarnessRunResult {
  results: HarnessTestResult[];
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

  const compileStart = Date.now();
  const result = await runDockerContainer(args, name, "", {
    contestantTimeoutMs: COMPILE_TIMEOUT_MS,
  });
  const startupTiming = `[timing] docker_startup_ms=${Date.now() - compileStart}`;
  const success = !result.timedOut && !result.oomKilled && result.exitCode === 0;
  if (success) return { success, output: startupTiming };

  const message = result.stderr || result.stdout || "Compilation failed";
  return { success, output: `${startupTiming}\n${message}`.slice(0, MAX_COMPILER_OUTPUT_CHARS) };
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

  const result = await runDockerContainer(args, name, testCase.input, {
    contestantTimeoutMs: input.timeLimitMs,
    startupTimeoutMs: RUN_STARTUP_TIMEOUT_MS,
    teardownTimeoutMs: RUN_TEARDOWN_TIMEOUT_MS,
  });

  const base = {
    testCaseId: testCase.id,
    output: result.stdout.slice(0, MAX_STORED_OUTPUT_CHARS),
    runtimeMs: result.runtimeMs,
    memoryKb: result.memoryKb,
  };

  const timeoutVerdict = verdictForTimeoutCategory(result.timeoutCategory);
  if (timeoutVerdict === "TIME_LIMIT_EXCEEDED") {
    return { ...base, passed: false, verdict: "TIME_LIMIT_EXCEEDED" };
  }
  if (timeoutVerdict === "INTERNAL_ERROR") {
    return {
      ...base,
      passed: false,
      verdict: "INTERNAL_ERROR",
      timeoutCategory: result.timeoutCategory,
    };
  }
  if (result.infrastructureError) {
    return { ...base, passed: false, verdict: "INTERNAL_ERROR" };
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

function mapHarnessResultToTestVerdict(
  testCase: EvaluateTestCase,
  item: HarnessTestResult,
): EvaluatorTestResult & { verdict: Verdict } {
  const base: EvaluatorTestResult = {
    testCaseId: testCase.id,
    passed: item.verdict === "ACCEPTED",
    output: item.stdout.slice(0, MAX_STORED_OUTPUT_CHARS),
    runtimeMs: item.runtimeMs,
    memoryKb: item.memoryKb,
    stderr: item.stderr.slice(0, MAX_STORED_OUTPUT_CHARS),
    exitCode: item.exitCode,
    exitSignal: item.exitSignal,
    timedOut: item.timedOut,
    timeoutCategory: item.timedOut ? "contestant_timeout" : "none",
  };

  if (item.verdict === "INTERNAL_ERROR") return { ...base, verdict: "INTERNAL_ERROR" };
  if (item.verdict === "TIME_LIMIT_EXCEEDED") return { ...base, verdict: "TIME_LIMIT_EXCEEDED" };
  if (item.verdict === "RUNTIME_ERROR") return { ...base, verdict: "RUNTIME_ERROR" };
  if (item.verdict === "WRONG_ANSWER") return { ...base, verdict: "WRONG_ANSWER" };
  return { ...base, verdict: "ACCEPTED", passed: true };
}

function bumpTimeoutCategoryCount(
  counts: Partial<Record<TimeoutCategory, number>>,
  category: TimeoutCategory,
): void {
  counts[category] = (counts[category] ?? 0) + 1;
}

export function derivePythonHarnessInfrastructureBudgetMs(input: {
  startupAllowanceMs: number;
  timeLimitMs: number;
  testCount: number;
  teardownAllowanceMs: number;
}): number {
  const tests = Math.max(1, input.testCount);
  return Math.max(
    1,
    input.startupAllowanceMs + input.timeLimitMs * tests + input.teardownAllowanceMs,
  );
}

async function runPythonSubmissionInSingleContainer(
  workspace: Workspace,
  input: EvaluateSubmissionInput,
): Promise<EvaluatorResult> {
  const harnessPath = path.join(workspace.containerDir, ".judge_harness.py");
  const payloadPath = path.join(workspace.containerDir, ".judge_payload.json");

  const harnessSource =
    "import json\n" +
    "import os\n" +
    "import signal\n" +
    "import subprocess\n" +
    "import sys\n" +
    "import time\n" +
    "try:\n" +
    "    import resource\n" +
    "except Exception:\n" +
    "    resource = None\n" +
    "\n" +
    "def mem_kb():\n" +
    "    if resource is None:\n" +
    "        return None\n" +
    "    try:\n" +
    "        return int(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss)\n" +
    "    except Exception:\n" +
    "        return None\n" +
    "\n" +
    "def to_text(value):\n" +
    "    if value is None:\n" +
    "        return ''\n" +
    "    if isinstance(value, bytes):\n" +
    "        return value.decode('utf-8', 'replace')\n" +
    "    return str(value)\n" +
    "\n" +
    "def normalize_output(text):\n" +
    "    text = to_text(text).replace('\\r\\n', '\\n')\n" +
    "    lines = text.split('\\n')\n" +
    "    lines = [line.rstrip(' \\t') for line in lines]\n" +
    "    text = '\\n'.join(lines)\n" +
    "    return text.rstrip('\\n')\n" +
    "\n" +
    "def main(payload_path):\n" +
    "    payload = json.load(open(payload_path, 'r', encoding='utf-8'))\n" +
    "    source_path = payload['sourcePath']\n" +
    "    timeout_s = max(0.001, float(payload['timeLimitMs']) / 1000.0)\n" +
    "    max_io_chars = max(256, int(payload.get('maxIoChars', 4000)))\n" +
    "    results = []\n" +
    "\n" +
    "    def clamp_text(value):\n" +
    "        text = to_text(value)\n" +
    "        if len(text) > max_io_chars:\n" +
    "            return text[:max_io_chars]\n" +
    "        return text\n" +
    "\n" +
    "    for tc in payload['tests']:\n" +
    "        before_mem = mem_kb()\n" +
    "        start = time.perf_counter()\n" +
    "        timed_out = False\n" +
    "        internal_error = False\n" +
    "        stdout = ''\n" +
    "        stderr = ''\n" +
    "        exit_code = None\n" +
    "        exit_signal = None\n" +
    "\n" +
    "        try:\n" +
    "            proc = subprocess.Popen(\n" +
    "                [sys.executable, source_path],\n" +
    "                stdin=subprocess.PIPE,\n" +
    "                stdout=subprocess.PIPE,\n" +
    "                stderr=subprocess.PIPE,\n" +
    "                text=True,\n" +
    "                start_new_session=True,\n" +
    "            )\n" +
    "            out, err = proc.communicate(input=tc['input'], timeout=timeout_s)\n" +
    "            exit_code = int(proc.returncode) if proc.returncode is not None else None\n" +
    "            if exit_code < 0:\n" +
    "                exit_signal = abs(exit_code)\n" +
    "            stdout = clamp_text(out)\n" +
    "            stderr = clamp_text(err)\n" +
    "        except subprocess.TimeoutExpired as ex:\n" +
    "            timed_out = True\n" +
    "            try:\n" +
    "                if proc.pid:\n" +
    "                    os.killpg(proc.pid, signal.SIGKILL)\n" +
    "            except Exception:\n" +
    "                pass\n" +
    "            try:\n" +
    "                out, err = proc.communicate(timeout=1.0)\n" +
    "            except Exception:\n" +
    "                out, err = getattr(ex, 'stdout', ''), getattr(ex, 'stderr', '')\n" +
    "            stdout = clamp_text(out)\n" +
    "            stderr = clamp_text(err)\n" +
    "        except Exception as ex:\n" +
    "            internal_error = True\n" +
    "            stderr = clamp_text(f'harness_error: {ex}')\n" +
    "\n" +
    "        runtime_ms = int(round((time.perf_counter() - start) * 1000.0))\n" +
    "        after_mem = mem_kb()\n" +
    "        mem_value = None\n" +
    "        if before_mem is not None and after_mem is not None:\n" +
    "            mem_value = max(0, after_mem - before_mem)\n" +
    "        elif after_mem is not None:\n" +
    "            mem_value = after_mem\n" +
    "\n" +
    "        verdict = 'ACCEPTED'\n" +
    "        if timed_out:\n" +
    "            verdict = 'TIME_LIMIT_EXCEEDED'\n" +
    "        elif internal_error:\n" +
    "            verdict = 'INTERNAL_ERROR'\n" +
    "        elif exit_signal is not None or exit_code != 0:\n" +
    "            verdict = 'RUNTIME_ERROR'\n" +
    "        else:\n" +
    "            if normalize_output(stdout) != normalize_output(tc.get('expectedOutput', '')):\n" +
    "                verdict = 'WRONG_ANSWER'\n" +
    "\n" +
    "        results.append({\n" +
    "            'testId': tc['id'],\n" +
    "            'stdout': stdout,\n" +
    "            'stderr': stderr,\n" +
    "            'exitCode': exit_code,\n" +
    "            'exitSignal': exit_signal,\n" +
    "            'runtimeMs': runtime_ms,\n" +
    "            'timedOut': timed_out,\n" +
    "            'memoryKb': mem_value,\n" +
    "            'verdict': verdict,\n" +
    "        })\n" +
    "\n" +
    "        if verdict != 'ACCEPTED':\n" +
    "            break\n" +
    "\n" +
    "    sys.stdout.write(json.dumps({'results': results}))\n" +
    "\n" +
    "if __name__ == '__main__':\n" +
    "    main(sys.argv[1])\n";

  const payload: HarnessPayload = {
    sourcePath: "/workspace/solution.py",
    timeLimitMs: input.timeLimitMs,
    maxIoChars: PYTHON_HARNESS_MAX_IO_CHARS,
    tests: input.testCases.map((tc) => ({
      id: tc.id,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
    })),
  };

  await Promise.all([
    writeFile(harnessPath, harnessSource, "utf8"),
    writeFile(payloadPath, JSON.stringify(payload), "utf8"),
  ]);

  const name = containerName("run", input.submissionId);
  const args = buildRunArgs({
    name,
    image: LANGUAGE_CONFIG.PYTHON.image,
    workspaceDir: workspace.hostDir,
    readOnlyWorkspace: true,
    memoryMb: input.memoryLimitMb,
    command: ["python3", "/workspace/.judge_harness.py", "/workspace/.judge_payload.json"],
  });

  const outerWatchdogBudgetMs = derivePythonHarnessInfrastructureBudgetMs({
    startupAllowanceMs: RUN_STARTUP_TIMEOUT_MS,
    timeLimitMs: input.timeLimitMs,
    testCount: input.testCases.length,
    teardownAllowanceMs: RUN_TEARDOWN_TIMEOUT_MS,
  });

  const timeoutCategoryCounts: Partial<Record<TimeoutCategory, number>> = {};
  const runResult = await runDockerContainer(args, name, "", {
    contestantTimeoutMs: outerWatchdogBudgetMs,
    startupTimeoutMs: RUN_STARTUP_TIMEOUT_MS,
    teardownTimeoutMs: RUN_TEARDOWN_TIMEOUT_MS,
  });
  bumpTimeoutCategoryCount(timeoutCategoryCounts, runResult.timeoutCategory);

  if (runResult.timeoutCategory === "contestant_timeout") {
    return {
      verdict: "INTERNAL_ERROR",
      testResults: [],
      compilerOutput: "Outer harness watchdog elapsed before structured test completion",
      runtimeMs: null,
      memoryKb: null,
      timeoutCategoryCounts,
      startupMs: runResult.startupMs,
      wallTimeMs: runResult.wallTimeMs,
    };
  }

  const runTimeoutVerdict = verdictForTimeoutCategory(runResult.timeoutCategory);
  if (runTimeoutVerdict === "INTERNAL_ERROR") {
    return {
      verdict: "INTERNAL_ERROR",
      testResults: [],
      compilerOutput: null,
      runtimeMs: null,
      memoryKb: null,
      timeoutCategoryCounts,
      startupMs: runResult.startupMs,
      wallTimeMs: runResult.wallTimeMs,
    };
  }

  if (runResult.infrastructureError || runResult.exitCode !== 0) {
    return {
      verdict: "INTERNAL_ERROR",
      testResults: [],
      compilerOutput: runResult.stderr.slice(0, MAX_COMPILER_OUTPUT_CHARS),
      runtimeMs: null,
      memoryKb: null,
      timeoutCategoryCounts,
      startupMs: runResult.startupMs,
      wallTimeMs: runResult.wallTimeMs,
    };
  }

  let parsed: HarnessRunResult;
  try {
    parsed = JSON.parse(runResult.stdout) as HarnessRunResult;
  } catch {
    return {
      verdict: "INTERNAL_ERROR",
      testResults: [],
      compilerOutput: runResult.stdout.slice(0, MAX_COMPILER_OUTPUT_CHARS),
      runtimeMs: null,
      memoryKb: null,
      timeoutCategoryCounts,
      startupMs: runResult.startupMs,
      wallTimeMs: runResult.wallTimeMs,
    };
  }

  const testResults: EvaluatorTestResult[] = [];
  let verdict: Verdict = "ACCEPTED";
  let maxRuntimeMs: number | null = null;
  let maxMemoryKb: number | null = null;
  let contestantTotalRuntimeMs = 0;

  const casesById = new Map(input.testCases.map((tc) => [tc.id, tc]));
  for (const item of parsed.results) {
    const testCase = casesById.get(item.testId);
    if (!testCase) {
      return {
        verdict: "INTERNAL_ERROR",
        testResults,
        compilerOutput: "Harness result referenced unknown test case",
        runtimeMs: maxRuntimeMs,
        memoryKb: maxMemoryKb,
        timeoutCategoryCounts,
      };
    }

    const mapped = mapHarnessResultToTestVerdict(testCase, item);
    testResults.push(mapped);

    if (mapped.runtimeMs !== null) {
      maxRuntimeMs = Math.max(maxRuntimeMs ?? 0, mapped.runtimeMs);
      contestantTotalRuntimeMs += mapped.runtimeMs;
    }
    if (mapped.memoryKb !== null) {
      maxMemoryKb = Math.max(maxMemoryKb ?? 0, mapped.memoryKb);
    }

    if (mapped.timeoutCategory) {
      bumpTimeoutCategoryCount(timeoutCategoryCounts, mapped.timeoutCategory);
    }

    if (mapped.verdict !== "ACCEPTED" && verdict === "ACCEPTED") {
      verdict = mapped.verdict;
    }
  }

  return {
    verdict,
    testResults,
    compilerOutput: null,
    runtimeMs: maxRuntimeMs,
    memoryKb: maxMemoryKb,
    timeoutCategoryCounts,
    startupMs: runResult.startupMs,
    wallTimeMs: runResult.wallTimeMs,
    teardownMs:
      runResult.wallTimeMs !== null && runResult.startupMs !== null
        ? Math.max(0, runResult.wallTimeMs - runResult.startupMs - contestantTotalRuntimeMs)
        : null,
    contestantTotalRuntimeMs,
  };
}

/**
 * Compiles (if needed) and runs a submission against its test cases inside
 * Docker sandboxes (PRD §12) — see docs/judge-security.md for the full
 * isolation model and its limitations. Stops at the first failing test,
 * matching most online judges, rather than always running every test.
 */
export async function evaluateSubmission(input: EvaluateSubmissionInput): Promise<EvaluatorResult> {
  const config = LANGUAGE_CONFIG[input.language];

  let sourceCode = input.sourceCode;
  if (input.language === "CPP") {
    const wrapped = wrapCppSubmission(input.sourceCode, input.problemSlug);
    if (wrapped.kind === "missing_contract") {
      // A class-only CPP submission with no registered adapter has no way
      // to be given a main() — fail fast with a clear configuration error
      // before touching Docker, rather than compiling into a
      // missing-main linker error.
      return {
        verdict: "INTERNAL_ERROR",
        testResults: [],
        compilerOutput:
          `No C++ class-method contract is registered for problem slug ` +
          `'${wrapped.slug ?? "(none)"}'. Submit a standalone program with its own ` +
          `main(), or contact support if this problem should support the class template.`,
        runtimeMs: null,
        memoryKb: null,
      };
    }
    sourceCode = wrapped.sourceCode;
  }

  const containerBaseDir = input.workspaceDir ?? tmpdir();
  const hostBaseDir = input.workspaceHostDir ?? containerBaseDir;
  const workspace = await createWorkspace(
    input.submissionId,
    config.sourceFilename,
    sourceCode,
    containerBaseDir,
    hostBaseDir,
  );

  try {
    if (input.language === "PYTHON") {
      return await runPythonSubmissionInSingleContainer(workspace, input);
    }

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
