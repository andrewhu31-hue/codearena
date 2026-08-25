import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const CONTEXT_FILE =
  process.env.CONTEXT_FILE ||
  join(dirname(fileURLToPath(import.meta.url)), "results", "context.json");
const START_INTERVAL_MS = Number(process.env.START_INTERVAL_MS || 75);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 500);
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 180000);
const API_BUDGET_MAX = Number(process.env.API_BUDGET_MAX || 300);
const TARGET_USERS = Number(process.env.TARGET_USERS || 100);
const MIN_ACCEPTED = Number(
  process.env.MIN_ACCEPTED || (TARGET_USERS === 100 ? 90 : Math.max(0, TARGET_USERS - 2)),
);
const DB_CANDIDATES = (process.env.DB_CANDIDATES || "codearena_loadtest,codearena")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const RUN_TAG = process.env.RUN_TAG || `paced-100-${Date.now()}`;
const EXPECTED_RATE_LIMITS = {
  submissionMax: 30,
  submissionWindowMs: 600000,
  generalMax: 300,
  generalWindowMs: 300000,
};
const SOURCE_CODE =
  `# ${RUN_TAG}\n` +
  "import sys\n" +
  "line = sys.stdin.readline()\n" +
  "if line.endswith('\\n'):\n" +
  "    line = line[:-1]\n" +
  "sys.stdout.write(line)\n";

const transportStats = {
  calls: 0,
  httpAttempts: 0,
  initialSocketFailures: 0,
  retriesAttempted: 0,
  recoveredAfterRetry: 0,
  failedAfterRetries: 0,
};

const progressState = {
  phase: "init",
  created: 0,
  terminal: 0,
  verified: 0,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function checkpointPath() {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "results");
  mkdirSync(outDir, { recursive: true });
  return join(outDir, `${RUN_TAG}-checkpoint.json`);
}

function writeCheckpoint(payload) {
  const path = checkpointPath();
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function fetchJson(url, options = {}) {
  const maxAttempts = 3;
  transportStats.calls += 1;
  let hadFailure = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    transportStats.httpAttempts += 1;
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let body;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }
      if (hadFailure) transportStats.recoveredAfterRetry += 1;
      return { status: res.status, ok: res.ok, body, attempts: attempt, hadFailure };
    } catch (err) {
      if (!hadFailure) {
        hadFailure = true;
        transportStats.initialSocketFailures += 1;
      }
      if (attempt === maxAttempts) {
        transportStats.failedAfterRetries += 1;
        return {
          status: 0,
          ok: false,
          body: { error: "FETCH_FAILED", detail: String(err) },
          attempts: attempt,
          hadFailure,
        };
      }
      transportStats.retriesAttempted += 1;
      await sleep(250 * attempt);
    }
  }

  transportStats.failedAfterRetries += 1;
  return {
    status: 0,
    ok: false,
    body: { error: "FETCH_FAILED" },
    attempts: maxAttempts,
    hadFailure,
  };
}

async function getSubmissionRowsByIds(submissionIds, dbName) {
  if (!submissionIds.length) return new Map();
  const { execFileSync } = await import("node:child_process");
  const escapedIds = submissionIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  const sql =
    `select id,status,verdict,` +
    `coalesce(\"runtimeMs\",0),coalesce(\"memoryKb\",0),` +
    `coalesce(\"testsPassed\",0),coalesce(\"testsTotal\",0),` +
    `coalesce((extract(epoch from \"terminalAt\") * 1000)::bigint,0) ` +
    `from submissions where id in (${escapedIds})`;
  const output = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "codearena",
      "-d",
      dbName,
      "-t",
      "-A",
      "-F",
      "|",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();

  const rows = new Map();
  if (!output) return rows;
  for (const line of output.split("\n").filter(Boolean)) {
    const [id, status, verdict, runtimeMs, memoryKb, testsPassed, testsTotal, terminalAtMs] =
      line.split("|");
    rows.set(id, {
      id,
      status,
      verdict: verdict === "" ? null : verdict,
      runtimeMs: Number(runtimeMs),
      memoryKb: Number(memoryKb),
      testsPassed: Number(testsPassed),
      testsTotal: Number(testsTotal),
      terminalAtMs: Number(terminalAtMs) || null,
    });
  }
  return rows;
}

async function waitForExactIdsTerminalViaDb(submissionIds) {
  const startedAt = Date.now();
  const pending = new Set(submissionIds);
  const terminals = new Map();
  const pollsById = new Map(submissionIds.map((id) => [id, 0]));

  while (pending.size > 0 && Date.now() - startedAt <= POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const pendingIds = [...pending];
    for (const id of pendingIds) {
      pollsById.set(id, (pollsById.get(id) ?? 0) + 1);
    }
    const rows = await getSubmissionRowsByIds(pendingIds, waitForExactIdsTerminalViaDb.dbName);
    for (const id of pendingIds) {
      const row = rows.get(id);
      if (!row) continue;
      if (row.status === "COMPLETED" || row.status === "FAILED") {
        terminals.set(id, {
          status: row.status,
          verdict: row.verdict,
          runtimeMs: row.runtimeMs,
          memoryKb: row.memoryKb,
          testsPassed: row.testsPassed,
          testsTotal: row.testsTotal,
          terminalAtMs: row.terminalAtMs,
          endedAt: Date.now(),
          polls: pollsById.get(id) ?? 0,
          source: "db",
        });
        pending.delete(id);
      }
    }
  }

  return { terminals, pending: [...pending] };
}

waitForExactIdsTerminalViaDb.dbName = "codearena";

async function detectDbNameForSubmissions(submissionIds) {
  const probeIds = submissionIds.slice(0, 5);
  for (const dbName of DB_CANDIDATES) {
    const rows = await getSubmissionRowsByIds(probeIds, dbName);
    if (rows.size > 0) return dbName;
  }
  throw new Error(
    `Unable to find created submissions in candidate databases: ${DB_CANDIDATES.join(",")}`,
  );
}

async function getGeneralLimiterKeySnapshot() {
  const { execFileSync } = await import("node:child_process");
  const script =
    "for k in $(redis-cli --scan --pattern 'ratelimit:general:general:*'); do " +
    'v=$(redis-cli GET "$k"); ' +
    't=$(redis-cli PTTL "$k"); ' +
    'echo "$k|${v:-0}|${t:-0}"; ' +
    "done";
  const output = execFileSync("docker", ["compose", "exec", "-T", "redis", "sh", "-lc", script], {
    encoding: "utf8",
  }).trim();

  const snapshot = new Map();
  if (!output) return snapshot;
  for (const line of output.split("\n").filter(Boolean)) {
    const [key, count, ttlMs] = line.split("|");
    snapshot.set(key, { count: Number(count) || 0, ttlMs: Number(ttlMs) || 0 });
  }
  return snapshot;
}

function resolveTouchedGeneralLimiterKey(before, after) {
  let bestKey = null;
  let bestDelta = -Infinity;
  for (const [key, post] of after.entries()) {
    const prev = before.get(key);
    const delta = post.count - (prev?.count ?? 0);
    if (delta > bestDelta) {
      bestDelta = delta;
      bestKey = key;
    }
  }
  return bestDelta > 0 ? bestKey : null;
}

async function clearGeneralLimiterKeyForLoadTestIp() {
  const before = await getGeneralLimiterKeySnapshot();
  const probe = await fetchJson(`${BASE_URL}/health`, { method: "GET" });
  const after = await getGeneralLimiterKeySnapshot();
  const touchedKey = resolveTouchedGeneralLimiterKey(before, after);
  const { execFileSync } = await import("node:child_process");
  if (touchedKey) {
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "redis",
        "sh",
        "-lc",
        `redis-cli DEL '${touchedKey}' >/dev/null || true`,
      ],
      { encoding: "utf8" },
    );
  }
  return { probeStatus: probe.status, touchedKey };
}

async function fetchLeaderboardOnce(context, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const lb = await fetchJson(`${BASE_URL}/api/v1/contests/${context.contestId}/leaderboard`, {
    method: "GET",
    headers,
  });
  const entries = Array.isArray(lb.body?.entries) ? lb.body.entries : [];
  return { status: lb.status, entries };
}

async function createSubmissionOnly(user, index, context) {
  await sleep(index * START_INTERVAL_MS);

  const idempotencyKey = `${RUN_TAG}-u${String(index + 1).padStart(3, "0")}-${user.userId}`;
  const headers = {
    Authorization: `Bearer ${user.token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };

  const submittedAt = Date.now();
  const post = await fetchJson(`${BASE_URL}/api/v1/submissions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contestId: context.contestId,
      problemId: context.problemId,
      language: "PYTHON",
      sourceCode: SOURCE_CODE,
    }),
  });

  const submissionId = post.body?.id ?? null;
  const postRecord = {
    userId: user.userId,
    idempotencyKey,
    submittedAt,
    postLatencyMs: Date.now() - submittedAt,
    httpStatus: post.status,
    ok: post.ok,
    submissionId,
    responseStatus: post.body?.status ?? null,
    responseVerdict: post.body?.verdict ?? null,
    error: post.ok ? null : post.body,
  };

  progressState.created += postRecord.ok ? 1 : 0;

  return {
    post: postRecord,
    terminal: null,
    leaderboardReflected: false,
    leaderboardCheckedAt: null,
    leaderboardHttpStatus: null,
  };
}

async function assertNormalRateLimits() {
  const { execFileSync } = await import("node:child_process");
  const raw = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "api",
      "sh",
      "-lc",
      'printf \'%s|%s|%s|%s\' "$SUBMISSION_RATE_LIMIT_MAX" "$SUBMISSION_RATE_LIMIT_WINDOW_MS" "$GENERAL_RATE_LIMIT_MAX" "$GENERAL_RATE_LIMIT_WINDOW_MS"',
    ],
    { encoding: "utf8" },
  ).trim();

  const [submissionMax, submissionWindowMs, generalMax, generalWindowMs] = raw
    .split("|")
    .map((v) => Number(v));

  if (
    submissionMax !== EXPECTED_RATE_LIMITS.submissionMax ||
    submissionWindowMs !== EXPECTED_RATE_LIMITS.submissionWindowMs ||
    generalMax !== EXPECTED_RATE_LIMITS.generalMax ||
    generalWindowMs !== EXPECTED_RATE_LIMITS.generalWindowMs
  ) {
    throw new Error(
      `Non-canonical rate limits: submission=${submissionMax}/${submissionWindowMs} general=${generalMax}/${generalWindowMs}`,
    );
  }
}

async function assertNoStaleContestantContainers() {
  const { execFileSync } = await import("node:child_process");
  const names = execFileSync("docker", ["ps", "-a", "--format", "{{.Names}}"], {
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const stale = names.filter((name) => /^codearena-run-test-/.test(name));
  if (stale.length > 0) {
    throw new Error(`Stale contestant containers found: ${stale.join(",")}`);
  }
}

async function assertQueueAndNonTerminalEmpty() {
  const { execFileSync } = await import("node:child_process");
  const queueProbe = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "redis",
      "sh",
      "-lc",
      "redis-cli LLEN bull:submissions:wait; redis-cli LLEN bull:submissions:active; redis-cli ZCARD bull:submissions:delayed; redis-cli ZCARD bull:submissions:prioritized; redis-cli ZCARD bull:submissions:waiting-children; redis-cli LLEN bull:submissions:paused",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((v) => Number(v.trim()) || 0);

  const queuePending = queueProbe.reduce((a, b) => a + b, 0);
  if (queuePending !== 0) {
    throw new Error(`Queue is not empty: pending=${queuePending}`);
  }

  const nonTerminal = Number(
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "codearena",
        "-d",
        "codearena_loadtest",
        "-t",
        "-A",
        "-c",
        "select count(*) from submissions where status in ('QUEUED','RUNNING')",
      ],
      { encoding: "utf8" },
    ).trim(),
  );

  if (nonTerminal !== 0) {
    throw new Error(`Nonterminal submissions present before run: ${nonTerminal}`);
  }
}

function buildSummary(run) {
  const posts = run.results.map((r) => r.post);
  const successes = posts.filter((p) => p.httpStatus === 201 || p.httpStatus === 200);
  const created = posts.filter((p) => p.httpStatus === 201);
  const distinctUsers = new Set(successes.map((p) => p.userId));
  const ids = successes.map((p) => p.submissionId).filter(Boolean);

  const terminals = run.results
    .filter((r) => r.terminal)
    .map((r) => ({ ...r.terminal, submissionId: r.post.submissionId, userId: r.post.userId }));
  const terminalCount = terminals.filter(
    (t) => t.status === "COMPLETED" || t.status === "FAILED",
  ).length;
  const accepted = terminals.filter((t) => t.verdict === "ACCEPTED");
  const verdictDistribution = terminals.reduce((acc, t) => {
    const key = t.verdict ?? t.status;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const leaderboardReflectedAccepted = run.results.filter(
    (r) => r.terminal?.verdict === "ACCEPTED" && r.leaderboardReflected,
  ).length;

  const terminalLatencyMs = run.results
    .filter((r) => Number.isFinite(r.post.submittedAt) && Number.isFinite(r.terminal?.terminalAtMs))
    .map((r) => Number(r.terminal.terminalAtMs) - Number(r.post.submittedAt))
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  const postLatencyMs = posts
    .map((p) => p.postLatencyMs)
    .filter((ms) => typeof ms === "number" && Number.isFinite(ms));

  const logicalUserOutcomes = {
    expectedUsers: TARGET_USERS,
    usersWith201Or200: successes.length,
    usersWith201Created: created.length,
    usersWithout201Or200: TARGET_USERS - successes.length,
  };

  const httpFailures = posts.filter((p) => !p.ok).length;

  const stageArrays = {
    queueWaitMs: [],
    dbReadMs: [],
    judgeTotalMs: [],
    dockerStartupMs: [],
    executionMs: [],
    terminalDbPersistMs: [],
  };

  for (const timing of run.workerStageTimings) {
    for (const key of Object.keys(stageArrays)) {
      const value = timing?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        stageArrays[key].push(value);
      }
    }
  }

  const timingStats = Object.fromEntries(
    Object.entries(stageArrays).map(([stage, values]) => [
      stage,
      {
        samples: values.length,
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        max: values.length ? Math.max(...values) : null,
      },
    ]),
  );

  return {
    runTag: run.runTag,
    baseUrl: run.baseUrl,
    usersExpected: TARGET_USERS,
    postsCaptured: posts.length,
    submissionIds: ids,
    distinctSubmittingUsers: [...distinctUsers],
    logicalUserOutcomes,
    retryAttemptOutcomes: {
      calls: transportStats.calls,
      httpAttempts: transportStats.httpAttempts,
      retriesAttempted: transportStats.retriesAttempted,
      recoveredAfterRetry: transportStats.recoveredAfterRetry,
      failedAfterRetries: transportStats.failedAfterRetries,
      initialSocketFailures: transportStats.initialSocketFailures,
    },
    metrics: {
      submissionsCreatedOverTarget: `${created.length}/${TARGET_USERS}`,
      distinctUsersOverTarget: `${distinctUsers.size}/${TARGET_USERS}`,
      terminalOverCreated: `${terminalCount}/${created.length}`,
      acceptedOverTerminal: `${accepted.length}/${terminalCount}`,
      httpFailureRate: posts.length ? httpFailures / posts.length : 0,
      verdictDistribution,
      acceptedUsersReflectedOnLeaderboard: `${leaderboardReflectedAccepted}/${accepted.length}`,
      postLatencyMs: {
        samples: postLatencyMs.length,
        p50: percentile(postLatencyMs, 50),
        p95: percentile(postLatencyMs, 95),
        p100: percentile(postLatencyMs, 100),
      },
      terminalLatencyMs: {
        samples: terminalLatencyMs.length,
        p50: percentile(terminalLatencyMs, 50),
        p95: percentile(terminalLatencyMs, 95),
        p100: percentile(terminalLatencyMs, 100),
      },
      apiBudget: {
        max: API_BUDGET_MAX,
        calls: transportStats.calls,
        httpAttempts: transportStats.httpAttempts,
        withinBudget: transportStats.httpAttempts <= API_BUDGET_MAX,
      },
      timingStageStats: timingStats,
      transport: transportStats,
      infrastructureErrors: run.infrastructureEvents,
    },
  };
}

function collectInfrastructureEvents(logText) {
  const patterns = [
    /P1001/i,
    /P2028/i,
    /transaction already closed/i,
    /transaction not found/i,
    /submission job failed/i,
    /can't reach database server/i,
    /failed to renew lock/i,
    /missing lock for job/i,
    /stalled jobs? check/i,
    /job stalled more than allowable limit/i,
    /stalled/i,
    /reconcil/i,
  ];
  return logText
    .split("\n")
    .filter((line) => patterns.some((re) => re.test(line)))
    .slice(-400);
}

function assertValidationGates(run, summary) {
  const created = run.results.filter((r) => r.post.httpStatus === 201).length;
  const received201Or200 = run.results.filter(
    (r) => r.post.httpStatus === 201 || r.post.httpStatus === 200,
  ).length;
  const distinctUsers = new Set(run.results.map((r) => r.post.userId)).size;
  const persistedDistinctIds = new Set(
    run.results
      .map((r) => r.post.submissionId)
      .filter((id) => typeof id === "string" && id.length > 0),
  ).size;
  const terminals = run.results.filter(
    (r) => r.terminal && (r.terminal.status === "COMPLETED" || r.terminal.status === "FAILED"),
  ).length;
  const accepted = run.results.filter((r) => r.terminal?.verdict === "ACCEPTED").length;
  const acceptedReflected = run.results.filter(
    (r) => r.terminal?.verdict === "ACCEPTED" && r.leaderboardReflected,
  ).length;
  const finalHttpFailures = run.results.filter(
    (r) =>
      !r.post.ok ||
      typeof r.submissionVerifyHttpStatus !== "number" ||
      r.submissionVerifyHttpStatus < 200 ||
      r.submissionVerifyHttpStatus >= 300 ||
      r.leaderboardHttpStatus < 200 ||
      r.leaderboardHttpStatus >= 300,
  ).length;
  const infraErrors = Array.isArray(run.infrastructureEvents) ? run.infrastructureEvents.length : 0;
  const withinBudget = summary.metrics.apiBudget.withinBudget;

  const failures = [];
  if (received201Or200 !== TARGET_USERS)
    failures.push(`received201Or200=${received201Or200}/${TARGET_USERS}`);
  if (persistedDistinctIds !== TARGET_USERS)
    failures.push(`persistedDistinctIds=${persistedDistinctIds}/${TARGET_USERS}`);
  if (created !== TARGET_USERS) failures.push(`created=${created}/${TARGET_USERS}`);
  if (distinctUsers !== TARGET_USERS)
    failures.push(`distinctUsers=${distinctUsers}/${TARGET_USERS}`);
  if (terminals !== TARGET_USERS) failures.push(`terminal=${terminals}/${TARGET_USERS}`);
  if (accepted < MIN_ACCEPTED)
    failures.push(`accepted=${accepted}/${TARGET_USERS} < ${MIN_ACCEPTED}`);
  if (acceptedReflected !== accepted) {
    failures.push(`acceptedReflected=${acceptedReflected}/${accepted}`);
  }
  if (finalHttpFailures !== 0) failures.push(`finalHttpFailures=${finalHttpFailures}`);
  if (infraErrors !== 0) failures.push(`infrastructureErrors=${infraErrors}`);
  if (!withinBudget) {
    failures.push(
      `apiBudget=${summary.metrics.apiBudget.httpAttempts}/${summary.metrics.apiBudget.max}`,
    );
  }

  return {
    pass: failures.length === 0,
    failures,
    details: {
      created,
      received201Or200,
      persistedDistinctIds,
      distinctUsers,
      terminals,
      accepted,
      acceptedReflected,
      finalHttpFailures,
      infraErrors,
      apiBudget: summary.metrics.apiBudget,
    },
  };
}

async function getRunningJudgeWorkerContainerNames() {
  const { execFileSync } = await import("node:child_process");
  const output = execFileSync(
    "docker",
    [
      "ps",
      "--filter",
      "label=com.docker.compose.project=codearena",
      "--filter",
      "label=com.docker.compose.service=judge-worker",
      "--filter",
      "status=running",
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function assertFourWorkersRunning() {
  const workers = await getRunningJudgeWorkerContainerNames();
  if (workers.length !== 4) {
    throw new Error(
      `Expected exactly 4 running judge-worker containers, found ${workers.length}: ${workers.join(", ") || "(none)"}`,
    );
  }
  return workers;
}

async function assertApiWorkerDatabaseAlignment() {
  const { execFileSync } = await import("node:child_process");
  const apiDb = execFileSync(
    "docker",
    ["compose", "exec", "-T", "api", "sh", "-lc", "echo $DATABASE_URL"],
    { encoding: "utf8" },
  ).trim();
  const workerDb = execFileSync(
    "docker",
    ["compose", "exec", "-T", "judge-worker", "sh", "-lc", "echo $DATABASE_URL"],
    { encoding: "utf8" },
  ).trim();

  if (!apiDb || !workerDb || apiDb !== workerDb) {
    throw new Error(
      `DATABASE_URL mismatch api='${apiDb || "(empty)"}' worker='${workerDb || "(empty)"}'`,
    );
  }

  if (!apiDb.includes("/codearena_loadtest")) {
    throw new Error(`DATABASE_URL is not codearena_loadtest: ${apiDb}`);
  }

  return apiDb;
}

async function getContainerHealthSnapshot() {
  const { execFileSync } = await import("node:child_process");
  const workers = await getRunningJudgeWorkerContainerNames();
  const targets = ["codearena-postgres-1", "codearena-api-1", ...workers, "codearena-redis-1"];
  const inspect = execFileSync(
    "docker",
    [
      "inspect",
      "-f",
      "{{.Name}} restart_count={{.RestartCount}} state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} started={{.State.StartedAt}}",
      ...targets,
    ],
    { encoding: "utf8" },
  );
  const stats = execFileSync("docker", ["stats", "--no-stream", ...targets], { encoding: "utf8" });
  return { inspect: inspect.trim().split("\n"), stats: stats.trim().split("\n") };
}

async function getComposeLogsSince(isoTs) {
  const { execFileSync } = await import("node:child_process");
  const opts = { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  const api = execFileSync(
    "docker",
    ["compose", "logs", "--since", isoTs, "--tail", "4000", "api"],
    opts,
  );
  const worker = execFileSync(
    "docker",
    ["compose", "logs", "--since", isoTs, "--tail", "4000", "judge-worker"],
    opts,
  );
  const postgres = execFileSync(
    "docker",
    ["compose", "logs", "--since", isoTs, "--tail", "4000", "postgres"],
    opts,
  );
  return { api, worker, postgres };
}

function extractWorkerTimingPayloads(workerLog, submissionIdsSet) {
  const payloads = [];
  for (const line of workerLog.split("\n")) {
    if (!line.includes("stageTimings")) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;

    try {
      const payload = JSON.parse(line.slice(jsonStart));
      if (!payload.submissionId || !submissionIdsSet.has(payload.submissionId)) continue;
      payloads.push({
        submissionId: payload.submissionId,
        verdict: payload.verdict ?? null,
        stageTimings: payload.stageTimings ?? null,
      });
    } catch {
      // Ignore malformed log lines.
    }
  }
  return payloads;
}

async function main() {
  const context = JSON.parse(readFileSync(CONTEXT_FILE, "utf8"));
  if (!Array.isArray(context.users)) throw new Error("context.users must be an array");
  if (context.users.length < TARGET_USERS) {
    throw new Error(
      `context.users must contain at least ${TARGET_USERS} users (got ${context.users.length})`,
    );
  }

  const distinctUsers = new Set(context.users.map((u) => u.userId));
  if (distinctUsers.size < TARGET_USERS) {
    throw new Error(
      `context.users must contain at least ${TARGET_USERS} distinct users (got ${distinctUsers.size})`,
    );
  }
  const selectedUsers = context.users.slice(0, TARGET_USERS);

  await assertFourWorkersRunning();
  const alignedDatabaseUrl = await assertApiWorkerDatabaseAlignment();
  await assertNormalRateLimits();
  await assertQueueAndNonTerminalEmpty();
  await assertNoStaleContestantContainers();

  if (!context.contestId || !context.problemId) {
    throw new Error("context must include contestId and problemId");
  }

  const firstToken = context.users[0]?.token;
  if (!firstToken) throw new Error("context must include user tokens");
  const preflightHeaders = { Authorization: `Bearer ${firstToken}` };
  const contestPreflight = await fetchJson(`${BASE_URL}/api/v1/contests/${context.contestId}`, {
    method: "GET",
    headers: preflightHeaders,
  });
  if (!contestPreflight.ok) {
    throw new Error(
      `contest preflight failed status=${contestPreflight.status} body=${JSON.stringify(contestPreflight.body)}`,
    );
  }

  const limiterReset = await clearGeneralLimiterKeyForLoadTestIp();

  const runStartedAt = new Date();
  const healthBefore = await getContainerHealthSnapshot();

  const progressTicker = setInterval(() => {
    console.log(
      `[progress] ts=${nowIso()} phase=${progressState.phase} created=${progressState.created}/${TARGET_USERS} terminal=${progressState.terminal}/${TARGET_USERS} verified=${progressState.verified}/${TARGET_USERS}`,
    );
  }, 15000);
  try {
    // Phase 1: creation only (exactly one submit per user), no status polling.
    progressState.phase = "phase1-create";
    const results = await Promise.all(
      selectedUsers.map((user, i) => createSubmissionOnly(user, i, context)),
    );

    // Phase 2: drain exact created IDs via Postgres, no API status traffic.
    const createdIds = results
      .map((result) => result.post.submissionId)
      .filter((id) => typeof id === "string" && id.length > 0);
    const phase1CheckpointPath = writeCheckpoint({
      updatedAt: nowIso(),
      runTag: RUN_TAG,
      phase: "phase1",
      postResults: results.map((r) => r.post),
      submissionIds: createdIds,
      distinctUserIds: [...new Set(results.map((r) => r.post.userId))],
    });
    console.log(`checkpoint=${phase1CheckpointPath} phase=phase1`);

    progressState.phase = "phase2-drain-db";
    const detectedDbName = await detectDbNameForSubmissions(createdIds);
    waitForExactIdsTerminalViaDb.dbName = detectedDbName;
    const { terminals, pending } = await waitForExactIdsTerminalViaDb(createdIds);
    for (const result of results) {
      const id = result.post.submissionId;
      if (id && terminals.has(id)) {
        result.terminal = terminals.get(id);
      }
    }
    progressState.terminal = results.filter(
      (r) => r.terminal?.status === "COMPLETED" || r.terminal?.status === "FAILED",
    ).length;
    const phase2CheckpointPath = writeCheckpoint({
      updatedAt: nowIso(),
      runTag: RUN_TAG,
      phase: "phase2",
      postResults: results.map((r) => r.post),
      submissionIds: createdIds,
      distinctUserIds: [...new Set(results.map((r) => r.post.userId))],
      terminals: results.map((r) => ({
        submissionId: r.post.submissionId,
        userId: r.post.userId,
        terminal: r.terminal,
      })),
      pendingSubmissionIds: pending,
      dbName: waitForExactIdsTerminalViaDb.dbName,
    });
    console.log(`checkpoint=${phase2CheckpointPath} phase=phase2`);
    if (pending.length > 0) {
      throw new Error(`Timed out waiting for terminal IDs: ${pending.join(",")}`);
    }

    // Phase 3: API verification (GET each created submission once, leaderboard once).
    progressState.phase = "phase3-api-verify";
    for (const result of results) {
      const id = result.post.submissionId;
      if (!id) continue;
      const token = selectedUsers.find((u) => u.userId === result.post.userId)?.token;
      if (!token) continue;
      const verifyHeaders = { Authorization: `Bearer ${token}` };
      const verify = await fetchJson(`${BASE_URL}/api/v1/submissions/${id}`, {
        method: "GET",
        headers: verifyHeaders,
      });
      if (verify.ok) {
        result.terminal = {
          status: verify.body?.status ?? result.terminal?.status ?? null,
          verdict: verify.body?.verdict ?? result.terminal?.verdict ?? null,
          runtimeMs: verify.body?.runtimeMs ?? result.terminal?.runtimeMs ?? null,
          memoryKb: verify.body?.memoryKb ?? result.terminal?.memoryKb ?? null,
          testsPassed: verify.body?.testsPassed ?? result.terminal?.testsPassed ?? null,
          testsTotal: verify.body?.testsTotal ?? result.terminal?.testsTotal ?? null,
          terminalAtMs: result.terminal?.terminalAtMs ?? null,
          endedAt: result.terminal?.endedAt ?? Date.now(),
          polls: result.terminal?.polls ?? 0,
          source: "api",
        };
      }
      result.submissionVerifyHttpStatus = verify.status;
      result.submissionVerifyError = verify.ok ? null : verify.body;
      progressState.verified += 1;
    }

    const leaderboardToken = context.users[0]?.token;
    const leaderboard = await fetchLeaderboardOnce(context, leaderboardToken);
    const leaderboardUsers = new Set(leaderboard.entries.map((entry) => entry.userId));
    for (const result of results) {
      const accepted = result.terminal?.verdict === "ACCEPTED";
      result.leaderboardCheckedAt = Date.now();
      result.leaderboardHttpStatus = leaderboard.status;
      result.leaderboardReflected = accepted ? leaderboardUsers.has(result.post.userId) : false;
    }

    const phase3CheckpointPath = writeCheckpoint({
      updatedAt: nowIso(),
      runTag: RUN_TAG,
      phase: "phase3",
      postResults: results.map((r) => r.post),
      submissionIds: createdIds,
      distinctUserIds: [...new Set(results.map((r) => r.post.userId))],
      terminals: results.map((r) => ({
        submissionId: r.post.submissionId,
        userId: r.post.userId,
        terminal: r.terminal,
        submissionVerifyHttpStatus: r.submissionVerifyHttpStatus,
        submissionVerifyError: r.submissionVerifyError,
        leaderboardReflected: r.leaderboardReflected,
        leaderboardHttpStatus: r.leaderboardHttpStatus,
      })),
      leaderboardStatus: leaderboard.status,
      leaderboardEntryCount: leaderboard.entries.length,
      dbName: waitForExactIdsTerminalViaDb.dbName,
    });
    console.log(`checkpoint=${phase3CheckpointPath} phase=phase3`);

    const runEndedAt = new Date();
    const healthAfter = await getContainerHealthSnapshot();
    const logs = await getComposeLogsSince(runStartedAt.toISOString());

    const submissionIds = new Set(
      results
        .map((r) => r.post.submissionId)
        .filter((id) => typeof id === "string" && id.length > 0),
    );

    const workerTimingPayloads = extractWorkerTimingPayloads(logs.worker, submissionIds);
    const workerStageTimings = workerTimingPayloads
      .map((p) => p.stageTimings)
      .filter((timing) => timing && typeof timing === "object");

    const infraEvents = [
      ...collectInfrastructureEvents(logs.api),
      ...collectInfrastructureEvents(logs.worker),
      ...collectInfrastructureEvents(logs.postgres),
    ];

    const run = {
      runTag: RUN_TAG,
      baseUrl: BASE_URL,
      targetUsers: TARGET_USERS,
      minAccepted: MIN_ACCEPTED,
      startedAt: runStartedAt.toISOString(),
      endedAt: runEndedAt.toISOString(),
      startIntervalMs: START_INTERVAL_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      pollTimeoutMs: POLL_TIMEOUT_MS,
      deterministicSourceCode: SOURCE_CODE,
      limiterReset,
      alignedDatabaseUrl,
      dbName: waitForExactIdsTerminalViaDb.dbName,
      results,
      submissionIds: [...submissionIds],
      workerTimingPayloads,
      workerStageTimings,
      infrastructureEvents: infraEvents,
      healthBefore,
      healthAfter,
      rawLogs: logs,
    };

    const summary = buildSummary(run);
    const gates = assertValidationGates(run, summary);
    summary.gates = gates;

    if (transportStats.httpAttempts > API_BUDGET_MAX) {
      throw new Error(
        `API request budget exceeded: attempts=${transportStats.httpAttempts} max=${API_BUDGET_MAX}`,
      );
    }

    if (!gates.pass) {
      throw new Error(`Validation gates failed: ${gates.failures.join("; ")}`);
    }

    const outDir = join(dirname(fileURLToPath(import.meta.url)), "results");
    mkdirSync(outDir, { recursive: true });
    const runPath = join(outDir, `${RUN_TAG}-raw.json`);
    const summaryPath = join(outDir, `${RUN_TAG}-summary.json`);

    writeFileSync(runPath, JSON.stringify(run, null, 2));
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log(`run_raw=${runPath}`);
    console.log(`run_summary=${summaryPath}`);
    console.log(`submission_posts=${run.results.length}`);
    console.log(`submission_ids=${run.submissionIds.length}`);
  } finally {
    clearInterval(progressTicker);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
