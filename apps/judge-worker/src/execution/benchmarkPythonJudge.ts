import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { evaluateSubmission } from "./evaluate.js";

interface BenchSample {
  verdict: string;
  runtimeMs: number | null;
  startupMs: number | null;
  teardownMs: number | null;
  wallTimeMs: number | null;
  contestantTotalRuntimeMs: number | null;
  timeoutCategoryCounts: Record<string, number>;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? null;
}

function summarize(samples: BenchSample[]) {
  const verdictDist: Record<string, number> = {};
  const timeoutDist: Record<string, number> = {};
  const startupVals: number[] = [];
  const teardownVals: number[] = [];
  const wallVals: number[] = [];
  const contestantVals: number[] = [];

  for (const s of samples) {
    verdictDist[s.verdict] = (verdictDist[s.verdict] ?? 0) + 1;
    for (const [k, v] of Object.entries(s.timeoutCategoryCounts)) {
      timeoutDist[k] = (timeoutDist[k] ?? 0) + v;
    }
    if (typeof s.startupMs === "number") startupVals.push(s.startupMs);
    if (typeof s.teardownMs === "number") teardownVals.push(s.teardownMs);
    if (typeof s.wallTimeMs === "number") wallVals.push(s.wallTimeMs);
    if (typeof s.contestantTotalRuntimeMs === "number")
      contestantVals.push(s.contestantTotalRuntimeMs);
  }

  return {
    submissions: samples.length,
    containerStarts: samples.length,
    verdictDistribution: verdictDist,
    timeoutCategoryDistribution: timeoutDist,
    contestantRuntimeMs: {
      p50: percentile(contestantVals, 50),
      p95: percentile(contestantVals, 95),
      max: contestantVals.length ? Math.max(...contestantVals) : null,
    },
    startupMs: {
      p50: percentile(startupVals, 50),
      p95: percentile(startupVals, 95),
      max: startupVals.length ? Math.max(...startupVals) : null,
    },
    teardownMs: {
      p50: percentile(teardownVals, 50),
      p95: percentile(teardownVals, 95),
      max: teardownVals.length ? Math.max(...teardownVals) : null,
    },
    totalJudgeMs: {
      p50: percentile(wallVals, 50),
      p95: percentile(wallVals, 95),
      max: wallVals.length ? Math.max(...wallVals) : null,
    },
  };
}

async function runOne(submissionId: string): Promise<BenchSample> {
  const sharedWorkspace =
    process.env.JUDGE_TEST_SHARED_WORKSPACE ?? process.env.JUDGE_WORKSPACE_HOST_DIR;
  const result = await evaluateSubmission({
    submissionId,
    language: "PYTHON",
    sourceCode:
      "import sys\n" +
      "line = sys.stdin.readline()\n" +
      "if line.endswith('\\n'):\n" +
      "    line = line[:-1]\n" +
      "sys.stdout.write(line)\n",
    timeLimitMs: 5000,
    memoryLimitMb: 256,
    testCases: [
      { id: randomUUID(), input: "alpha\n", expectedOutput: "alpha" },
      { id: randomUUID(), input: "beta\n", expectedOutput: "beta" },
      { id: randomUUID(), input: "gamma\n", expectedOutput: "gamma" },
    ],
    ...(sharedWorkspace
      ? {
          workspaceDir: sharedWorkspace,
          workspaceHostDir: sharedWorkspace,
        }
      : {}),
  });

  return {
    verdict: result.verdict,
    runtimeMs: result.runtimeMs,
    startupMs: result.startupMs ?? null,
    teardownMs: result.teardownMs ?? null,
    wallTimeMs: result.wallTimeMs ?? null,
    contestantTotalRuntimeMs: result.contestantTotalRuntimeMs ?? null,
    timeoutCategoryCounts: result.timeoutCategoryCounts ?? {},
  };
}

async function runConcurrent(total: number, parallel: number, tag: string): Promise<BenchSample[]> {
  const out: BenchSample[] = [];
  for (let i = 0; i < total; i += parallel) {
    const batch = Math.min(parallel, total - i);
    const results = await Promise.all(
      Array.from({ length: batch }).map((_, idx) =>
        runOne(`bench10-${tag}-${i + idx}-${randomUUID()}`),
      ),
    );
    out.push(...results);
  }
  return out;
}

function leakedContainersForTag(tag: string): string[] {
  const output = execFileSync(
    "docker",
    ["ps", "-a", "--filter", `name=^/codearena-run-bench10-${tag}-`, "--format", "{{.Names}}"],
    { encoding: "utf8" },
  );
  return output
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function timeoutCount(summary: ReturnType<typeof summarize>, category: string): number {
  return summary.timeoutCategoryDistribution[category] ?? 0;
}

async function main() {
  const count = Number(process.env.BENCH_SUBMISSIONS ?? 10);
  const parallel = Number(process.env.BENCH_PARALLEL ?? 4);
  const tag = randomUUID().slice(0, 8);

  const benchmarkSamples = await runConcurrent(count, parallel, tag);
  const summary = summarize(benchmarkSamples);
  const leaks = leakedContainersForTag(tag);

  const assertions: string[] = [];
  if (summary.submissions !== count) {
    assertions.push(`Expected ${count} submissions, got ${summary.submissions}`);
  }
  if (summary.containerStarts !== count) {
    assertions.push(`Expected exactly ${count} container starts, got ${summary.containerStarts}`);
  }
  if ((summary.verdictDistribution.ACCEPTED ?? 0) !== count) {
    assertions.push(
      `Expected all ACCEPTED, got distribution ${JSON.stringify(summary.verdictDistribution)}`,
    );
  }
  if (timeoutCount(summary, "contestant_timeout") !== 0) {
    assertions.push("Expected zero contestant_timeout events");
  }
  if (timeoutCount(summary, "startup_timeout") !== 0) {
    assertions.push("Expected zero startup_timeout events");
  }
  if (timeoutCount(summary, "teardown_timeout") !== 0) {
    assertions.push("Expected zero teardown_timeout events");
  }
  if (leaks.length !== 0) {
    assertions.push(`Expected zero leaked containers, found ${leaks.length}`);
  }

  const report = {
    count,
    parallel,
    tag,
    summary,
    leakedContainers: leaks,
    assertions,
    passed: assertions.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));

  if (assertions.length > 0) {
    process.exitCode = 1;
  }
}

void main();
