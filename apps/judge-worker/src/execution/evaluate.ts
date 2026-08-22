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
}

export interface EvaluatorResult {
  verdict: Verdict;
  testResults: EvaluatorTestResult[];
  compilerOutput: string | null;
  runtimeMs: number | null;
  memoryKb: number | null;
}

interface CppHarnessSpec {
  method: string;
  kind:
  | "vecInt_target_to_vecInt"
  | "string_to_string"
  | "int_to_vecString"
  | "vecInt_target_to_int"
  | "string_to_int"
  | "intervals_to_intervals";
}

const CPP_HARNESS_BY_SLUG: Record<string, CppHarnessSpec> = {
  "two-sum": { method: "twoSum", kind: "vecInt_target_to_vecInt" },
  "reverse-string": { method: "reverseString", kind: "string_to_string" },
  "fizz-buzz": { method: "fizzBuzz", kind: "int_to_vecString" },
  "binary-search": { method: "search", kind: "vecInt_target_to_int" },
  "longest-substring": { method: "lengthOfLongestSubstring", kind: "string_to_int" },
  "merge-intervals": { method: "merge", kind: "intervals_to_intervals" },
};

function hasCppMain(sourceCode: string): boolean {
  return /\bint\s+main\s*\(/.test(sourceCode);
}

function buildCppHarness(slug?: string): string | null {
  if (!slug) return null;
  const spec = CPP_HARNESS_BY_SLUG[slug];
  if (!spec) return null;

  const commonHelpers = String.raw`

static vector<int> parseIntLine(const string& line) {
  vector<int> nums;
  stringstream ss(line);
  int x;
  while (ss >> x) nums.push_back(x);
  return nums;
}

static string trimTrailingNewline(string s) {
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
  return s;
}

static void printVecInt(const vector<int>& v) {
  for (size_t i = 0; i < v.size(); i++) {
    if (i) cout << ' ';
    cout << v[i];
  }
}

static void printVecStringLines(const vector<string>& v) {
  for (size_t i = 0; i < v.size(); i++) {
    if (i) cout << '\n';
    cout << v[i];
  }
}

static vector<vector<int>> parseIntervalsFromAllInput(const string& all) {
  vector<vector<int>> intervals;
  stringstream ss(all);
  int a, b;
  while (ss >> a >> b) intervals.push_back({a, b});
  return intervals;
}

static void printIntervals(const vector<vector<int>>& intervals) {
  for (size_t i = 0; i < intervals.size(); i++) {
    if (i) cout << '\n';
    if (intervals[i].size() >= 2) cout << intervals[i][0] << ' ' << intervals[i][1];
  }
}
`;

  const mainByKind: Record<CppHarnessSpec["kind"], string> = {
    vecInt_target_to_vecInt: String.raw`
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  string numsLine, targetLine;
  getline(cin, numsLine);
  getline(cin, targetLine);

  vector<int> nums = parseIntLine(numsLine);
  int target = 0;
  if (!targetLine.empty()) {
    stringstream ss(targetLine);
    ss >> target;
  }

  Solution solution;
  vector<int> ans = solution.${spec.method}(nums, target);
  printVecInt(ans);
  return 0;
}
`,
    string_to_string: String.raw`
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  string s;
  getline(cin, s);
  s = trimTrailingNewline(s);

  Solution solution;
  cout << solution.${spec.method}(s);
  return 0;
}
`,
    int_to_vecString: String.raw`
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  int n = 0;
  cin >> n;

  Solution solution;
  vector<string> ans = solution.${spec.method}(n);
  printVecStringLines(ans);
  return 0;
}
`,
    vecInt_target_to_int: String.raw`
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  string numsLine, targetLine;
  getline(cin, numsLine);
  getline(cin, targetLine);

  vector<int> nums = parseIntLine(numsLine);
  int target = 0;
  if (!targetLine.empty()) {
    stringstream ss(targetLine);
    ss >> target;
  }

  Solution solution;
  cout << solution.${spec.method}(nums, target);
  return 0;
}
`,
    string_to_int: String.raw`
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  string s;
  getline(cin, s);
  s = trimTrailingNewline(s);

  Solution solution;
  cout << solution.${spec.method}(s);
  return 0;
}
`,
    intervals_to_intervals: String.raw`
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  string all((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
  vector<vector<int>> intervals = parseIntervalsFromAllInput(all);

  Solution solution;
  vector<vector<int>> ans = solution.${spec.method}(intervals);
  printIntervals(ans);
  return 0;
}
`,
  };

  return `${commonHelpers}\n${mainByKind[spec.kind]}`;
}

function maybeWrapCppLeetCodeSource(sourceCode: string, problemSlug?: string): string {
  if (hasCppMain(sourceCode)) return sourceCode;
  const harness = buildCppHarness(problemSlug);
  if (!harness) return sourceCode;
  return `${sourceCode}\n${harness}`;
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
  const sourceCode =
    input.language === "CPP"
      ? maybeWrapCppLeetCodeSource(input.sourceCode, input.problemSlug)
      : input.sourceCode;
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
