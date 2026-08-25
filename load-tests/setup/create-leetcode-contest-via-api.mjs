#!/usr/bin/env node
// Creates a public LeetCode-style contest from the existing problem catalog
// via the API and writes a k6 context file with N simulated users.
//
// Usage:
//   JWT_ACCESS_SECRET=... node load-tests/setup/create-leetcode-contest-via-api.mjs [userCount]

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

const API_ROOT = process.env.CODEARENA_API_URL ?? "http://localhost:4000/api/v1";
const USER_COUNT = Number(process.argv[2] || process.env.LOAD_TEST_USERS || 100);
const CONTEST_HOURS = Number(process.env.LOAD_TEST_CONTEST_HOURS || 4);
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is required (must match the running API secret)");
}
if (!Number.isFinite(USER_COUNT) || USER_COUNT <= 0) {
  throw new Error(`Invalid user count: ${USER_COUNT}`);
}

const outPath = fileURLToPath(new URL("../results/leetcode-context.json", import.meta.url));

function pointsForDifficulty(difficulty) {
  if (difficulty === "HARD") return 300;
  if (difficulty === "MEDIUM") return 200;
  return 100;
}

async function http(path, options = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const bodyText = await res.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }

  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && body.error?.message) ||
      `${res.status} ${res.statusText}`;
    throw new Error(`HTTP ${res.status} ${path}: ${msg}`);
  }

  return body;
}

async function main() {
  const problemsPayload = await http("/problems", { method: "GET" });
  const problems = problemsPayload?.problems ?? [];
  if (problems.length === 0) {
    throw new Error("No problems returned by GET /problems");
  }

  const contestProblems = problems.map((p, index) => ({
    problemId: p.id,
    points: pointsForDifficulty(p.difficulty),
    order: index,
  }));

  const now = Date.now();
  const startTime = new Date(now - 5 * 60 * 1000).toISOString();
  const endTime = new Date(now + CONTEST_HOURS * 60 * 60 * 1000).toISOString();

  const adminToken = jwt.sign({ sub: "loadtest-admin", role: "ADMIN" }, JWT_ACCESS_SECRET, {
    expiresIn: "4h",
  });

  const created = await http("/contests", {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `LeetCode-Style Blind 75 Simulation ${now}`,
      description: "Generated for 100-user k6 contest spike simulation.",
      startTime,
      endTime,
      visibility: "PUBLIC",
      problems: contestProblems,
    }),
  });

  const users = Array.from({ length: USER_COUNT }, (_, i) => {
    const token = jwt.sign({ sub: `sim-user-${now}-${i}`, role: "CONTESTANT" }, JWT_ACCESS_SECRET, {
      expiresIn: "4h",
    });
    return { userId: `sim-user-${i}`, token };
  });

  const context = {
    contestId: created.id,
    contestName: created.name,
    problemCount: contestProblems.length,
    problemId: problems[0].id,
    users,
  };

  writeFileSync(outPath, JSON.stringify(context, null, 2));

  console.log(`Created contest: ${created.id}`);
  console.log(`Contest name: ${created.name}`);
  console.log(`Problems attached: ${contestProblems.length}`);
  console.log(`Simulated users in context: ${users.length}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
