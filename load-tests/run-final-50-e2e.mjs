import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(ROOT, "results");
mkdirSync(RESULTS_DIR, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const CONTEXT_FILE = process.env.CONTEXT_FILE || join(RESULTS_DIR, "context.json");
const TARGET_USERS = Number(process.env.TARGET_USERS || 50);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 500);
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 8 * 60 * 1000);
const LEADERBOARD_POLL_INTERVAL_MS = Number(process.env.LEADERBOARD_POLL_INTERVAL_MS || 500);
const LEADERBOARD_POLL_ATTEMPTS = Number(process.env.LEADERBOARD_POLL_ATTEMPTS || 20);
const GET_RETRY_MAX_RETRIES = Number(process.env.GET_RETRY_MAX_RETRIES || 3);
const GET_RETRY_BASE_BACKOFF_MS = Number(process.env.GET_RETRY_BASE_BACKOFF_MS || 200);

const RUN_TAG = process.env.RUN_TAG || `final-e2e-${TARGET_USERS}-${Date.now()}`;
const RAW_PATH = join(RESULTS_DIR, `${RUN_TAG}-raw.json`);
const SUMMARY_PATH = join(RESULTS_DIR, `${RUN_TAG}-summary.json`);

const EXPECTED_RATE_LIMITS = {
  submissionMax: 30,
  submissionWindowMs: 600000,
  generalMax: 300,
  generalWindowMs: 300000,
};

const ENDPOINT_KEYS = [
  "authMe",
  "contestGet",
  "problemGet",
  "submissionPost",
  "submissionGet",
  "leaderboardGet",
  "health",
];
const IDEMPOTENT_GET_ENDPOINTS = ["contestGet", "problemGet", "submissionGet", "leaderboardGet"];

const endpointStats = Object.fromEntries(ENDPOINT_KEYS.map((k) => [k, initEndpointStats()]));
const idempotentGetRetryStats = Object.fromEntries(
  IDEMPOTENT_GET_ENDPOINTS.map((k) => [k, initIdempotentGetRetryStats()]),
);

function initEndpointStats() {
  return {
    calls: 0,
    ok2xx: 0,
    s200: 0,
    s201: 0,
    s429: 0,
    s4xx: 0,
    s5xx: 0,
    transport: 0,
    latenciesMs: [],
  };
}

function initIdempotentGetRetryStats() {
  return {
    requests: 0,
    initialTransportFailures: 0,
    retriesAttempted: 0,
    recoveries: 0,
    finalTransportFailures: 0,
    finalHttpFailures: 0,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function docker(commandArgs) {
  return execFileSync("docker", commandArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function parseDbName(url) {
  try {
    const u = new URL(url);
    return (u.pathname || "").replace(/^\//, "").split("?")[0];
  } catch {
    return null;
  }
}

function endpointRecord(endpoint, result, latencyMs) {
  const bucket = endpointStats[endpoint];
  bucket.calls += 1;
  if (typeof latencyMs === "number" && Number.isFinite(latencyMs))
    bucket.latenciesMs.push(latencyMs);
  if (result.transportError) {
    bucket.transport += 1;
    return;
  }

  const s = result.status;
  if (s >= 200 && s < 300) bucket.ok2xx += 1;
  if (s === 200) bucket.s200 += 1;
  if (s === 201) bucket.s201 += 1;
  if (s === 429) bucket.s429 += 1;
  if (s >= 400 && s < 500) bucket.s4xx += 1;
  if (s >= 500) bucket.s5xx += 1;
}

async function fetchJson(endpoint, url, options = {}) {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    const out = { status: res.status, ok: res.ok, body, transportError: false };
    endpointRecord(endpoint, out, Date.now() - startedAt);
    return out;
  } catch (err) {
    const out = {
      status: 0,
      ok: false,
      body: { error: "FETCH_FAILED", detail: String(err) },
      transportError: true,
    };
    endpointRecord(endpoint, out, Date.now() - startedAt);
    return out;
  }
}

async function fetchIdempotentGetWithRetry(endpoint, url, headers) {
  const stats = idempotentGetRetryStats[endpoint];
  if (!stats) throw new Error(`No idempotent GET stats bucket for endpoint ${endpoint}`);

  stats.requests += 1;
  const attempts = [];
  let sawInitialTransportFailure = false;

  for (let attempt = 0; ; attempt += 1) {
    const result = await fetchJson(endpoint, url, { method: "GET", headers });
    attempts.push({
      attempt: attempt + 1,
      status: result.status,
      ok: result.ok,
      transportError: result.transportError,
    });

    if (attempt === 0 && result.transportError) {
      stats.initialTransportFailures += 1;
      sawInitialTransportFailure = true;
    }

    if (result.ok) {
      if (sawInitialTransportFailure) {
        stats.recoveries += 1;
      }
      return { result, attempts };
    }

    if (!result.transportError) {
      stats.finalHttpFailures += 1;
      return { result, attempts };
    }

    if (attempt >= GET_RETRY_MAX_RETRIES) {
      stats.finalTransportFailures += 1;
      return { result, attempts };
    }

    stats.retriesAttempted += 1;
    const backoffMs = GET_RETRY_BASE_BACKOFF_MS * 2 ** attempt;
    await sleep(backoffMs);
  }
}

function sqlRows(sql) {
  const out = docker([
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
    "-F",
    "|",
    "-c",
    sql,
  ]);
  return out ? out.split("\n").filter(Boolean) : [];
}

function queueSnapshot() {
  const out = docker([
    "compose",
    "exec",
    "-T",
    "redis",
    "sh",
    "-lc",
    "echo wait=$(redis-cli LLEN bull:submissions:wait); echo active=$(redis-cli LLEN bull:submissions:active); echo delayed=$(redis-cli ZCARD bull:submissions:delayed); echo prioritized=$(redis-cli ZCARD bull:submissions:prioritized); echo waiting_children=$(redis-cli ZCARD bull:submissions:waiting-children); echo paused=$(redis-cli LLEN bull:submissions:paused)",
  ]);
  const parsed = {};
  for (const line of out.split("\n")) {
    const t = line.trim();
    if (!t.includes("=")) continue;
    const [k, v] = t.split("=");
    parsed[k] = Number(v) || 0;
  }
  parsed.pendingTotal =
    (parsed.wait || 0) +
    (parsed.active || 0) +
    (parsed.delayed || 0) +
    (parsed.prioritized || 0) +
    (parsed.waiting_children || 0) +
    (parsed.paused || 0);
  return parsed;
}

function assertPreflight() {
  const apiDb = docker(["compose", "exec", "-T", "api", "sh", "-lc", "echo $DATABASE_URL"]).trim();
  const workerDb = docker([
    "compose",
    "exec",
    "-T",
    "judge-worker",
    "sh",
    "-lc",
    "echo $DATABASE_URL",
  ]).trim();
  const apiDbName = parseDbName(apiDb);
  const workerDbName = parseDbName(workerDb);

  if (apiDbName !== "codearena_loadtest" || workerDbName !== "codearena_loadtest") {
    throw new Error(`DB target mismatch api=${apiDb} worker=${workerDb}`);
  }

  const workers = docker([
    "ps",
    "--filter",
    "label=com.docker.compose.project=codearena",
    "--filter",
    "label=com.docker.compose.service=judge-worker",
    "--format",
    "{{.Names}}|{{.Image}}",
  ])
    .split("\n")
    .filter(Boolean);

  if (workers.length !== 4) {
    throw new Error(`Expected 4 workers, found ${workers.length}`);
  }
  const uniqueImages = new Set(workers.map((line) => line.split("|")[1]));
  if (uniqueImages.size !== 1) {
    throw new Error(`Worker images differ: ${[...uniqueImages].join(",")}`);
  }

  const limitsRaw = docker([
    "compose",
    "exec",
    "-T",
    "api",
    "sh",
    "-lc",
    'printf \'%s|%s|%s|%s\' "$SUBMISSION_RATE_LIMIT_MAX" "$SUBMISSION_RATE_LIMIT_WINDOW_MS" "$GENERAL_RATE_LIMIT_MAX" "$GENERAL_RATE_LIMIT_WINDOW_MS"',
  ]);
  const [sm, sw, gm, gw] = limitsRaw.split("|").map((n) => Number(n));
  if (
    sm !== EXPECTED_RATE_LIMITS.submissionMax ||
    sw !== EXPECTED_RATE_LIMITS.submissionWindowMs ||
    gm !== EXPECTED_RATE_LIMITS.generalMax ||
    gw !== EXPECTED_RATE_LIMITS.generalWindowMs
  ) {
    throw new Error(`Rate limits not canonical: submission=${sm}/${sw} general=${gm}/${gw}`);
  }

  const queue = queueSnapshot();
  if (queue.pendingTotal !== 0) {
    throw new Error(`Queue not empty before run: pending=${queue.pendingTotal}`);
  }

  const nonTerminal = Number(
    docker([
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
    ]),
  );
  if (nonTerminal !== 0) {
    throw new Error(`Nonterminal submissions before run: ${nonTerminal}`);
  }

  const stale = docker(["ps", "-a", "--format", "{{.Names}}"])
    .split("\n")
    .filter((n) => /^codearena-run-test-/.test(n));
  if (stale.length > 0) {
    throw new Error(`Stale contestant containers: ${stale.join(",")}`);
  }

  return { apiDb, workerDb, workers, queue, nonTerminal, staleCount: stale.length };
}

async function waitForTerminalBySubmissionId(submissionId) {
  const startedAtMs = Date.now();
  while (Date.now() - startedAtMs <= POLL_TIMEOUT_MS) {
    const rows = sqlRows(
      `select id,status,verdict,coalesce(\"runtimeMs\",0),coalesce(\"testsPassed\",0),coalesce(\"testsTotal\",0),coalesce((extract(epoch from \"terminalAt\")*1000)::bigint,0) from submissions where id = '${submissionId.replace(/'/g, "''")}'`,
    );
    if (rows.length > 0) {
      const [id, status, verdict, runtimeMs, testsPassed, testsTotal, terminalAtMs] =
        rows[0].split("|");
      if (status === "COMPLETED" || status === "FAILED") {
        return {
          id,
          status,
          verdict: verdict || null,
          runtimeMs: Number(runtimeMs) || null,
          testsPassed: Number(testsPassed) || 0,
          testsTotal: Number(testsTotal) || 0,
          terminalAtMs: Number(terminalAtMs) || null,
          pollDurationMs: Date.now() - startedAtMs,
        };
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

function extractWorkerStageTimings(logText, submissionSet) {
  const out = new Map();
  for (const line of logText.split("\n")) {
    if (!line.includes("stageTimings")) continue;
    const i = line.indexOf("{");
    if (i < 0) continue;
    try {
      const p = JSON.parse(line.slice(i));
      if (!p.submissionId || !submissionSet.has(p.submissionId)) continue;
      if (p.stageTimings && typeof p.stageTimings === "object") {
        out.set(p.submissionId, p.stageTimings);
      }
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

function collectInfraCounts(apiLog, workerLog, pgLog) {
  const all = `${apiLog}\n${workerLog}\n${pgLog}`;
  const count = (re) => (all.match(re) || []).length;
  return {
    p1001: count(/P1001/gi),
    lockOrStall: count(
      /failed to renew lock|missing lock for job|job stalled more than allowable limit|stalled jobs? check/gi,
    ),
    internalError: count(/INTERNAL_ERROR/gi),
    staleContainerLeaks: docker(["ps", "-a", "--format", "{{.Names}}"])
      .split("\n")
      .filter((n) => /^codearena-run-test-/.test(n)).length,
  };
}

function sumFinalGetFailures(retryStats) {
  let finalTransportFailures = 0;
  let finalHttpFailures = 0;
  for (const stats of Object.values(retryStats)) {
    finalTransportFailures += stats.finalTransportFailures || 0;
    finalHttpFailures += stats.finalHttpFailures || 0;
  }
  return {
    finalTransportFailures,
    finalHttpFailures,
    total: finalTransportFailures + finalHttpFailures,
  };
}

async function main() {
  const runStartedAtIso = new Date().toISOString();
  const context = JSON.parse(readFileSync(CONTEXT_FILE, "utf8"));
  if (!Array.isArray(context.users) || context.users.length < TARGET_USERS) {
    throw new Error(`context.users must contain at least ${TARGET_USERS} users`);
  }

  const selectedUsers = context.users.slice(0, TARGET_USERS);
  const distinct = new Set(selectedUsers.map((u) => u.userId));
  if (distinct.size !== TARGET_USERS) throw new Error("Selected users are not distinct");
  if (!context.contestId || !context.problemId || !context.problemSlug) {
    throw new Error("context must include contestId/problemId/problemSlug");
  }

  const preflight = assertPreflight();
  const healthSamples = [];
  const resourceSamples = [];
  let monitorRunning = true;

  const workerNames = preflight.workers.map((w) => w.split("|")[0]);
  const resourceTargets = [
    "codearena-api-1",
    "codearena-postgres-1",
    "codearena-redis-1",
    ...workerNames,
  ];

  const monitorPromise = (async () => {
    while (monitorRunning) {
      const at = Date.now();
      const health = await fetchJson("health", `${BASE_URL}/health`, { method: "GET" });
      healthSamples.push({
        at,
        status: health.status,
        ok: health.ok,
        transportError: health.transportError,
      });

      try {
        const statsRaw = docker([
          "stats",
          "--no-stream",
          "--format",
          "{{json .}}",
          ...resourceTargets,
        ]);
        const stats = statsRaw
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        const swapSnapshot = {};
        for (const c of resourceTargets) {
          try {
            const swapCurrent = docker([
              "exec",
              c,
              "sh",
              "-lc",
              "cat /sys/fs/cgroup/memory.swap.current 2>/dev/null || echo NA",
            ]);
            swapSnapshot[c] = swapCurrent === "NA" ? null : Number(swapCurrent);
          } catch {
            swapSnapshot[c] = null;
          }
        }

        resourceSamples.push({ at, stats, swapSnapshot });
      } catch {
        // ignore transient monitor failures
      }

      await sleep(2000);
    }
  })();

  const sourceCode =
    `# ${RUN_TAG}\n` +
    "import sys\n" +
    "line = sys.stdin.readline()\n" +
    "if line.endswith('\\n'):\n" +
    "    line = line[:-1]\n" +
    "sys.stdout.write(line)\n";

  const journeys = [];
  for (const [idx, user] of selectedUsers.entries()) {
    journeys.push({
      userId: user.userId,
      accessToken: user.token,
      ordinal: idx + 1,
      idempotencyKey: `${RUN_TAG}-u${String(idx + 1).padStart(3, "0")}-${user.userId}`,
      steps: [],
      completed: false,
      failReason: null,
      submissionId: null,
      submittedAtMs: null,
      terminal: null,
      acceptedVerified: false,
      leaderboardReflected: false,
      leaderboardReflectedAtMs: null,
      journeyStartedAtMs: null,
      journeyEndedAtMs: null,
    });
  }

  const journeyRuns = journeys.map(async (j) => {
    j.journeyStartedAtMs = Date.now();
    const failJourney = (reason) => {
      j.failReason = reason;
      j.journeyEndedAtMs = Date.now();
    };

    const headers = { Authorization: `Bearer ${j.accessToken}` };
    const auth = await fetchJson("authMe", `${BASE_URL}/api/v1/auth/me`, {
      method: "GET",
      headers,
    });
    j.steps.push({ step: "auth", atMs: Date.now(), result: auth });
    if (!auth.ok || auth.body?.id !== j.userId) {
      failJourney("auth verification failed");
      return;
    }

    const contest = await fetchIdempotentGetWithRetry(
      "contestGet",
      `${BASE_URL}/api/v1/contests/${context.contestId}`,
      headers,
    );
    j.steps.push({
      step: "contest",
      atMs: Date.now(),
      result: contest.result,
      retry: { attempts: contest.attempts },
    });
    if (!contest.result.ok) {
      failJourney("contest GET failed");
      return;
    }

    const problem = await fetchIdempotentGetWithRetry(
      "problemGet",
      `${BASE_URL}/api/v1/problems/${context.problemSlug}`,
      headers,
    );
    j.steps.push({
      step: "problem",
      atMs: Date.now(),
      result: problem.result,
      retry: { attempts: problem.attempts },
    });
    if (!problem.result.ok) {
      failJourney("problem GET failed");
      return;
    }

    const submittedAt = Date.now();
    const post = await fetchJson("submissionPost", `${BASE_URL}/api/v1/submissions`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": j.idempotencyKey,
      },
      body: JSON.stringify({
        contestId: context.contestId,
        problemId: context.problemId,
        language: "PYTHON",
        sourceCode,
      }),
    });
    j.steps.push({ step: "submissionPost", atMs: Date.now(), result: post });
    if (!(post.status === 201 || post.status === 200) || !post.body?.id) {
      failJourney("submission POST failed");
      return;
    }

    j.submissionId = post.body.id;
    j.submittedAtMs = submittedAt;

    const terminal = await waitForTerminalBySubmissionId(j.submissionId);
    if (!terminal) {
      j.steps.push({ step: "waitTerminal", atMs: Date.now(), timedOut: true });
      failJourney("timed out waiting own terminal state");
      return;
    }

    j.terminal = terminal;
    j.steps.push({
      step: "waitTerminal",
      atMs: Date.now(),
      timedOut: false,
      pollDurationMs: terminal.pollDurationMs,
      terminalStatus: terminal.status,
      terminalVerdict: terminal.verdict,
      terminalAtMs: terminal.terminalAtMs,
    });

    const terminalGet = await fetchIdempotentGetWithRetry(
      "submissionGet",
      `${BASE_URL}/api/v1/submissions/${j.submissionId}`,
      headers,
    );
    j.steps.push({
      step: "submissionGet",
      atMs: Date.now(),
      result: terminalGet.result,
      retry: { attempts: terminalGet.attempts },
    });

    const accepted =
      terminalGet.result.ok &&
      terminalGet.result.body?.status === "COMPLETED" &&
      terminalGet.result.body?.verdict === "ACCEPTED";
    j.acceptedVerified = Boolean(accepted);
    if (!j.acceptedVerified) {
      failJourney("submission terminal GET not ACCEPTED");
      return;
    }

    let reflected = false;
    for (let attempt = 1; attempt <= LEADERBOARD_POLL_ATTEMPTS; attempt += 1) {
      const lb = await fetchIdempotentGetWithRetry(
        "leaderboardGet",
        `${BASE_URL}/api/v1/contests/${context.contestId}/leaderboard`,
        headers,
      );
      j.steps.push({
        step: "leaderboardGet",
        attempt,
        atMs: Date.now(),
        result: lb.result,
        retry: { attempts: lb.attempts },
      });

      if (lb.result.ok && Array.isArray(lb.result.body?.entries)) {
        const found = lb.result.body.entries.find((e) => e.userId === j.userId);
        if (found) {
          reflected = true;
          j.leaderboardReflected = true;
          j.leaderboardReflectedAtMs = Date.now();
          j.leaderboardEntry = found;
          break;
        }
      }

      await sleep(LEADERBOARD_POLL_INTERVAL_MS);
    }

    j.completed = Boolean(j.acceptedVerified && reflected);
    if (!j.completed) {
      failJourney("leaderboard never reflected own score");
      return;
    }

    j.journeyEndedAtMs = j.leaderboardReflectedAtMs;
  });

  await Promise.all(journeyRuns);

  monitorRunning = false;
  await monitorPromise;

  const logsApi = docker(["compose", "logs", "--since", runStartedAtIso, "--tail", "8000", "api"]);
  const logsWorker = docker([
    "compose",
    "logs",
    "--since",
    runStartedAtIso,
    "--tail",
    "8000",
    "judge-worker",
  ]);
  const logsPg = docker([
    "compose",
    "logs",
    "--since",
    runStartedAtIso,
    "--tail",
    "8000",
    "postgres",
  ]);

  const createdIds = journeys.map((j) => j.submissionId).filter((id) => typeof id === "string");
  const stageBySubmission = extractWorkerStageTimings(logsWorker, new Set(createdIds));

  const queueWaitMs = [];
  const judgeRuntimeMs = [];
  const terminalLatencyMs = [];
  const leaderboardUpdateLatencyMs = [];
  const journeyLatencyMs = [];

  for (const j of journeys) {
    const st = j.submissionId ? stageBySubmission.get(j.submissionId) : null;
    if (st && Number.isFinite(st.queueWaitMs)) queueWaitMs.push(st.queueWaitMs);
    if (st && Number.isFinite(st.executionMs)) judgeRuntimeMs.push(st.executionMs);

    if (Number.isFinite(j.submittedAtMs) && Number.isFinite(j.terminal?.terminalAtMs)) {
      const v = Number(j.terminal.terminalAtMs) - Number(j.submittedAtMs);
      if (v >= 0) terminalLatencyMs.push(v);
    }

    if (Number.isFinite(j.terminal?.terminalAtMs) && Number.isFinite(j.leaderboardReflectedAtMs)) {
      const v = Number(j.leaderboardReflectedAtMs) - Number(j.terminal.terminalAtMs);
      if (v >= 0) leaderboardUpdateLatencyMs.push(v);
    }

    if (Number.isFinite(j.journeyStartedAtMs) && Number.isFinite(j.journeyEndedAtMs)) {
      const v = Number(j.journeyEndedAtMs) - Number(j.journeyStartedAtMs);
      if (v >= 0) journeyLatencyMs.push(v);
    }
  }

  const healthFailures = [];
  let currentFailure = null;
  for (const sample of healthSamples) {
    const failed = sample.transportError || sample.status < 200 || sample.status >= 300;
    if (failed && !currentFailure) {
      currentFailure = { startedAtMs: sample.at, endedAtMs: sample.at, firstStatus: sample.status };
    } else if (failed && currentFailure) {
      currentFailure.endedAtMs = sample.at;
    } else if (!failed && currentFailure) {
      healthFailures.push({
        ...currentFailure,
        durationMs: currentFailure.endedAtMs - currentFailure.startedAtMs,
      });
      currentFailure = null;
    }
  }
  if (currentFailure) {
    healthFailures.push({
      ...currentFailure,
      durationMs: currentFailure.endedAtMs - currentFailure.startedAtMs,
    });
  }

  const pressureByContainer = {};
  for (const sample of resourceSamples) {
    for (const s of sample.stats || []) {
      const name = s.Name;
      if (!pressureByContainer[name]) {
        pressureByContainer[name] = {
          maxCpuPct: 0,
          maxMemPct: 0,
          lastMemUsage: null,
          maxSwapCurrentBytes: null,
        };
      }
      const cpu = Number(String(s.CPUPerc || "0").replace("%", "")) || 0;
      const memPct = Number(String(s.MemPerc || "0").replace("%", "")) || 0;
      pressureByContainer[name].maxCpuPct = Math.max(pressureByContainer[name].maxCpuPct, cpu);
      pressureByContainer[name].maxMemPct = Math.max(pressureByContainer[name].maxMemPct, memPct);
      pressureByContainer[name].lastMemUsage = s.MemUsage;

      const swapCurrent = sample.swapSnapshot ? sample.swapSnapshot[name] : null;
      if (typeof swapCurrent === "number") {
        const prev = pressureByContainer[name].maxSwapCurrentBytes;
        pressureByContainer[name].maxSwapCurrentBytes =
          typeof prev === "number" ? Math.max(prev, swapCurrent) : swapCurrent;
      }
    }
  }

  const endpointSuccessRate = {};
  for (const [k, v] of Object.entries(endpointStats)) {
    endpointSuccessRate[k] = {
      calls: v.calls,
      successRate: v.calls ? v.ok2xx / v.calls : null,
      outcomes: {
        s201: v.s201,
        s200: v.s200,
        s429: v.s429,
        s4xx: v.s4xx,
        s5xx: v.s5xx,
        transport: v.transport,
      },
      latencyMs: {
        p50: percentile(v.latenciesMs, 50),
        p95: percentile(v.latenciesMs, 95),
        p100: percentile(v.latenciesMs, 100),
      },
    };
  }

  const acceptedCount = journeys.filter((j) => j.acceptedVerified).length;
  const reflectedCount = journeys.filter((j) => j.leaderboardReflected).length;
  const fullJourneysCompleted = journeys.filter((j) => j.completed).length;

  const infraCounts = collectInfraCounts(logsApi, logsWorker, logsPg);
  const idempotentGetFinalFailures = sumFinalGetFailures(idempotentGetRetryStats);

  const requirementGates = {
    fullJourneysCompleted: fullJourneysCompleted === TARGET_USERS,
    acceptedVerified: acceptedCount === TARGET_USERS,
    leaderboardReflected: reflectedCount === TARGET_USERS,
    zeroFinalGetFailures: idempotentGetFinalFailures.total === 0,
    zeroInfrastructureErrors:
      infraCounts.p1001 === 0 &&
      infraCounts.lockOrStall === 0 &&
      infraCounts.internalError === 0 &&
      infraCounts.staleContainerLeaks === 0,
  };
  requirementGates.allPassed = Object.values(requirementGates).every(Boolean);

  const raw = {
    runTag: RUN_TAG,
    startedAt: runStartedAtIso,
    endedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    targetUsers: TARGET_USERS,
    contextFile: CONTEXT_FILE,
    contestId: context.contestId,
    problemId: context.problemId,
    problemSlug: context.problemSlug,
    retryConfig: {
      getRetryMaxRetries: GET_RETRY_MAX_RETRIES,
      getRetryBaseBackoffMs: GET_RETRY_BASE_BACKOFF_MS,
    },
    preflight,
    journeys,
    endpointStats,
    idempotentGetRetryStats,
    idempotentGetFinalFailures,
    healthSamples,
    healthFailures,
    resourceSamples,
    pressureByContainer,
    logs: {
      api: logsApi,
      worker: logsWorker,
      postgres: logsPg,
    },
    stageBySubmission: Object.fromEntries(stageBySubmission.entries()),
    requirementGates,
  };

  const summary = {
    runTag: RUN_TAG,
    fullJourneysCompleted: `${fullJourneysCompleted}/${TARGET_USERS}`,
    endpointSuccessRate,
    idempotentGetRetryStats,
    idempotentGetFinalFailures,
    postOutcomes: endpointSuccessRate.submissionPost?.outcomes,
    postLatencyMs: endpointSuccessRate.submissionPost?.latencyMs,
    queueWaitLatencyMs: {
      samples: queueWaitMs.length,
      p50: percentile(queueWaitMs, 50),
      p95: percentile(queueWaitMs, 95),
      p100: percentile(queueWaitMs, 100),
    },
    judgeRuntimeMs: {
      samples: judgeRuntimeMs.length,
      p50: percentile(judgeRuntimeMs, 50),
      p95: percentile(judgeRuntimeMs, 95),
      p100: percentile(judgeRuntimeMs, 100),
    },
    terminalLatencyMs: {
      samples: terminalLatencyMs.length,
      p50: percentile(terminalLatencyMs, 50),
      p95: percentile(terminalLatencyMs, 95),
      p100: percentile(terminalLatencyMs, 100),
    },
    leaderboardUpdateLatencyMs: {
      samples: leaderboardUpdateLatencyMs.length,
      p50: percentile(leaderboardUpdateLatencyMs, 50),
      p95: percentile(leaderboardUpdateLatencyMs, 95),
      p100: percentile(leaderboardUpdateLatencyMs, 100),
    },
    totalJourneyLatencyMs: {
      samples: journeyLatencyMs.length,
      p50: percentile(journeyLatencyMs, 50),
      p95: percentile(journeyLatencyMs, 95),
      p100: percentile(journeyLatencyMs, 100),
    },
    acceptedRate: `${acceptedCount}/${TARGET_USERS}`,
    leaderboardReflectionRate: `${reflectedCount}/${TARGET_USERS}`,
    infraCounts,
    healthCheckFailures: {
      count: healthFailures.length,
      totalDurationMs: healthFailures.reduce((sum, f) => sum + (f.durationMs || 0), 0),
      failures: healthFailures,
    },
    pressureByContainer,
    requirementGates,
    artifacts: {
      raw: RAW_PATH,
      summary: SUMMARY_PATH,
    },
  };

  writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2));
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log(`run_raw=${RAW_PATH}`);
  console.log(`run_summary=${SUMMARY_PATH}`);
  console.log(`full_journeys_completed=${summary.fullJourneysCompleted}`);
  console.log(`accepted_rate=${summary.acceptedRate}`);
  console.log(`leaderboard_reflection_rate=${summary.leaderboardReflectionRate}`);
  console.log(`idempotent_get_final_failures=${summary.idempotentGetFinalFailures.total}`);
  console.log(`requirements_all_passed=${summary.requirementGates.allPassed}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
