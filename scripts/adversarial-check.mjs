#!/usr/bin/env node

const API_ROOT = process.env.CODEARENA_API_URL ?? "http://localhost:4000/api/v1";
const POLL_INTERVAL_MS = 1500;
const INITIAL_POLL_DELAY_MS = 1200;
const POLL_TIMEOUT_MS = 120000;
const SUBMISSIONS_PER_ACCOUNT = Number(process.env.ADV_SUBMISSIONS_PER_ACCOUNT ?? "24");
const MAX_PROBES = Number(process.env.ADV_MAX_PROBES ?? "0");
const SUBMIT_RETRY_ROUNDS = Number(process.env.ADV_SUBMIT_RETRY_ROUNDS ?? "4");
const SUBMIT_RETRY_SLEEP_MS = Number(process.env.ADV_SUBMIT_RETRY_SLEEP_MS ?? "4000");
const POLL_RETRY_ROUNDS = Number(process.env.ADV_POLL_RETRY_ROUNDS ?? "6");
const POLL_RETRY_SLEEP_MS = Number(process.env.ADV_POLL_RETRY_SLEEP_MS ?? "2500");
const HTTP_RETRY_ROUNDS = Number(process.env.ADV_HTTP_RETRY_ROUNDS ?? "4");
const HTTP_RETRY_SLEEP_MS = Number(process.env.ADV_HTTP_RETRY_SLEEP_MS ?? "1200");

const SEEDED_ACCOUNTS = [
  {
    email: process.env.ADV_EMAIL_1 ?? "alice@codearena.dev",
    password: process.env.ADV_PASSWORD_1 ?? "ChangeMe123!",
  },
  {
    email: process.env.ADV_EMAIL_2 ?? "bob@codearena.dev",
    password: process.env.ADV_PASSWORD_2 ?? "ChangeMe123!",
  },
  {
    email: process.env.ADV_EMAIL_3 ?? "admin@codearena.dev",
    password: process.env.ADV_PASSWORD_3 ?? "ChangeMe123!",
  },
];

/** @typedef {{
 * slug: string,
 * name: string,
 * language: "PYTHON" | "JAVASCRIPT" | "CPP",
 * expected: "REJECT" | "ACCEPT",
 * sourceCode: string
 * }} Probe
 */

/** @type {Probe[]} */
const BASELINE_PROBES = [
  {
    slug: "two-sum",
    name: "Two Sum wrong fixed output",
    language: "PYTHON",
    expected: "REJECT",
    sourceCode: `print("0 1")\n`,
  },
  {
    slug: "two-sum",
    name: "Two Sum correct hashmap",
    language: "CPP",
    expected: "ACCEPT",
    sourceCode: `#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        unordered_map<int, int> seen;\n        for (int i = 0; i < static_cast<int>(nums.size()); i++) {\n            int need = target - nums[i];\n            auto it = seen.find(need);\n            if (it != seen.end()) return {it->second, i};\n            seen[nums[i]] = i;\n        }\n        return {};\n    }\n};\n`,
  },
];

const GENERIC_WRONG_PYTHON = `import sys\n_ = sys.stdin.read()\nprint("definitely-wrong-output")\n`;

function getRetryMeta(err) {
  if (!err || typeof err !== "object") {
    return { status: undefined, retryAfterMs: 0, cause: undefined };
  }
  const meta = /** @type {{ status?: unknown; retryAfterMs?: unknown; cause?: unknown }} */ (err);
  const status = typeof meta.status === "number" ? meta.status : undefined;
  const retryAfterMs =
    typeof meta.retryAfterMs === "number" && meta.retryAfterMs > 0 ? meta.retryAfterMs : 0;
  return { status, retryAfterMs, cause: meta.cause };
}

async function http(path, options = {}) {
  let res;
  let lastFetchErr = null;
  for (let attempt = 0; attempt < HTTP_RETRY_ROUNDS; attempt++) {
    try {
      res = await fetch(`${API_ROOT}${path}`, {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(options.headers ?? {}),
        },
      });
      break;
    } catch (err) {
      lastFetchErr = err;
      if (attempt < HTTP_RETRY_ROUNDS - 1) {
        await new Promise((r) => setTimeout(r, HTTP_RETRY_SLEEP_MS));
      }
    }
  }

  if (!res) {
    if (lastFetchErr instanceof Error) throw lastFetchErr;
    throw new Error(`Network request failed for ${path}`);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = body?.error?.message ?? `${res.status} ${res.statusText}`;
    const err = new Error(`HTTP ${res.status} on ${path}: ${msg}`);
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSeconds = Number(retryAfterHeader ?? "0");
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1000)
        : 0;
    // @ts-expect-error: attach HTTP status metadata for runtime retry logic.
    err.status = res.status;
    // @ts-expect-error: attach HTTP response body metadata for diagnostics.
    err.body = body;
    // @ts-expect-error: attach server-advised retry delay for runtime backoff.
    err.retryAfterMs = retryAfterMs;
    throw err;
  }

  return body;
}

async function login(email, password) {
  const body = await http("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!body?.accessToken) {
    throw new Error("Login succeeded but no accessToken returned");
  }
  return body.accessToken;
}

async function getProblemMap() {
  const body = await http("/problems", { method: "GET" });
  const map = new Map();
  for (const p of body.problems ?? []) map.set(p.slug, p.id);
  return map;
}

async function submit(token, problemId, probe) {
  const body = await http("/submissions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      problemId,
      language: probe.language,
      sourceCode: probe.sourceCode,
    }),
  });
  return body.id;
}

async function submitWithRetry(tokenPool, startIndex, problemId, probe) {
  let lastErr = null;
  for (let round = 0; round < SUBMIT_RETRY_ROUNDS; round++) {
    for (let offset = 0; offset < tokenPool.length; offset++) {
      const tokenRecord = tokenPool[(startIndex + offset) % tokenPool.length];
      try {
        const submissionId = await submit(tokenRecord.token, problemId, probe);
        return { submissionId, tokenRecord };
      } catch (err) {
        if (getRetryMeta(err).status === 429) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    const retryAfterMs = getRetryMeta(lastErr).retryAfterMs;
    const sleepMs = Math.max(SUBMIT_RETRY_SLEEP_MS, retryAfterMs);
    await new Promise((r) => setTimeout(r, sleepMs));
  }

  if (lastErr) throw lastErr;
  throw new Error("Submission failed without a specific error");
}

async function getSubmission(token, submissionId) {
  return http(`/submissions/${submissionId}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

async function getSubmissionWithRetry(token, submissionId) {
  let lastErr = null;
  for (let round = 0; round < POLL_RETRY_ROUNDS; round++) {
    try {
      return await getSubmission(token, submissionId);
    } catch (err) {
      const meta = getRetryMeta(err);
      if (meta.status !== 429) throw err;
      lastErr = err;
      const retryAfterMs = meta.retryAfterMs;
      const sleepMs = Math.max(POLL_RETRY_SLEEP_MS, retryAfterMs);
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }

  if (lastErr) throw lastErr;
  throw new Error(`Unable to poll submission ${submissionId}`);
}

async function waitForTerminal(token, submissionId) {
  await new Promise((r) => setTimeout(r, INITIAL_POLL_DELAY_MS));
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const sub = await getSubmissionWithRetry(token, submissionId);
    if (sub.status === "COMPLETED" || sub.status === "FAILED") return sub;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for submission ${submissionId}`);
}

function didPassExpectation(probe, verdict) {
  if (probe.expected === "ACCEPT") return verdict === "ACCEPTED";
  return verdict !== "ACCEPTED";
}

function printResultLine(index, probe, sub) {
  const ok = didPassExpectation(probe, sub.verdict);
  const icon = ok ? "PASS" : "FAIL";
  const tests = `${sub.testsPassed}/${sub.testsTotal}`;
  console.log(`${String(index + 1).padStart(2, "0")}. [${icon}] ${probe.slug} :: ${probe.name}`);
  console.log(`    verdict=${sub.verdict} tests=${tests} status=${sub.status}`);
}

function buildAllCatalogWrongProbes(problemSlugs) {
  const baselineSlugs = new Set(BASELINE_PROBES.map((p) => p.slug));
  const probes = [];
  for (const slug of problemSlugs) {
    if (baselineSlugs.has(slug)) continue;
    probes.push({
      slug,
      name: "Generic wrong output",
      language: "PYTHON",
      expected: "REJECT",
      sourceCode: GENERIC_WRONG_PYTHON,
    });
  }
  return probes;
}

function pickToken(tokenPool, index) {
  const accountIndex = Math.floor(index / SUBMISSIONS_PER_ACCOUNT) % tokenPool.length;
  return tokenPool[accountIndex];
}

async function main() {
  console.log("Adversarial checker starting...");
  console.log(`API root: ${API_ROOT}`);

  const tokenPool = [];
  for (const acct of SEEDED_ACCOUNTS) {
    const token = await login(acct.email, acct.password);
    tokenPool.push({ email: acct.email, token });
  }

  console.log(`Logged in seeded accounts: ${tokenPool.map((t) => t.email).join(", ")}`);
  console.log(`Submission rotation per account: ${SUBMISSIONS_PER_ACCOUNT}`);

  const problems = await getProblemMap();
  const allSlugs = [...problems.keys()].sort();

  const generatedProbes = buildAllCatalogWrongProbes(allSlugs);
  const probes = [...BASELINE_PROBES, ...generatedProbes];
  const finalProbes = MAX_PROBES > 0 ? probes.slice(0, MAX_PROBES) : probes;

  let failures = 0;
  let executed = 0;

  for (let i = 0; i < finalProbes.length; i++) {
    const probe = finalProbes[i];
    const problemId = problems.get(probe.slug);
    if (!problemId) {
      failures += 1;
      console.log(`${String(i + 1).padStart(2, "0")}. [FAIL] ${probe.slug} missing from catalog`);
      continue;
    }

    try {
      const preferred = pickToken(tokenPool, i);
      const preferredIndex = tokenPool.findIndex((t) => t.email === preferred.email);
      const { submissionId, tokenRecord } = await submitWithRetry(
        tokenPool,
        Math.max(0, preferredIndex),
        problemId,
        probe,
      );
      const sub = await waitForTerminal(tokenRecord.token, submissionId);
      printResultLine(i, probe, sub);
      executed += 1;
      if (!didPassExpectation(probe, sub.verdict)) failures += 1;
    } catch (err) {
      failures += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`${String(i + 1).padStart(2, "0")}. [FAIL] ${probe.slug} :: ${probe.name}`);
      console.log(`    error=${message}`);
    }
  }

  console.log("\nSummary");
  console.log(`Catalog problems: ${allSlugs.length}`);
  console.log(`Executed probes: ${executed}/${finalProbes.length}`);
  console.log(`Failures: ${failures}`);

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const cause = getRetryMeta(err).cause;
  console.error(`Fatal: ${message}`);
  if (stack) console.error(stack);
  if (cause) console.error("Cause:", cause);
  process.exit(1);
});
