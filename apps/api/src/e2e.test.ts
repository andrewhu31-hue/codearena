import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { Redis } from "ioredis";
import { assertDedicatedTestDatabase, prisma } from "@codearena/database";
import { loadApiEnv } from "@codearena/config";
import type { LeaderboardEntry } from "@codearena/shared";
import { createApp } from "./app.js";
import { createSubmissionQueue } from "./lib/queue.js";

function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const canRun = hasTestInfra && isDockerAvailable();
const describeIfReady = canRun ? describe : describe.skip;

function assertSafeCleanupTarget() {
  assertDedicatedTestDatabase(process.env.DATABASE_URL ?? "", "API e2e test cleanup");
}

function waitForWorkerReady(proc: ChildProcess, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for the judge worker process to start"));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes("Judge worker listening")) {
        clearTimeout(timer);
        proc.stdout?.off("data", onData);
        resolve();
      }
    };
    proc.stdout?.on("data", onData);
    proc.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Judge worker process exited early with code ${code}`));
      }
    });
  });
}

async function pollUntilTerminal(
  app: Express,
  token: string,
  submissionId: string,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app)
      .get(`/api/v1/submissions/${submissionId}`)
      .set("Authorization", `Bearer ${token}`);
    if (res.body.status === "COMPLETED" || res.body.status === "FAILED") return res.body;
    if (Date.now() > deadline) throw new Error("Timed out waiting for the submission to finish");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function pollForLeaderboardEntry(
  app: Express,
  contestId: string,
  userId: string,
  timeoutMs = 10_000,
): Promise<LeaderboardEntry> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app).get(`/api/v1/contests/${contestId}/leaderboard`);
    const entry = (res.body.entries as LeaderboardEntry[] | undefined)?.find(
      (e) => e.userId === userId,
    );
    if (entry) return entry;
    if (Date.now() > deadline) throw new Error("Timed out waiting for the leaderboard to update");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/**
 * PRD §16's named deterministic end-to-end test: "register, open a
 * problem, submit a correct solution, process it, receive ACCEPTED, and
 * update the leaderboard." Unlike the other integration suites, this one
 * spawns the real judge-worker as its own OS process — not imported
 * in-process — so the test exercises the actual service boundary
 * (Postgres/Redis/HTTP only) the same way Docker Compose or two separate
 * hosts would in production, rather than a shortcut that only proves the
 * code can be called directly.
 */
describeIfReady("full end-to-end lifecycle (PRD §16)", () => {
  let app: Express;
  let redis: Redis;
  let queueHandle: ReturnType<typeof createSubmissionQueue>;
  let workerProcess: ChildProcess;

  beforeAll(async () => {
    const env = loadApiEnv();
    redis = new Redis(env.REDIS_URL);
    queueHandle = createSubmissionQueue(env);
    app = createApp(env, redis, queueHandle.queue);

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    workerProcess = spawn("npx", ["tsx", "../judge-worker/src/index.ts"], {
      cwd: apiRoot,
      env: {
        ...process.env,
        WORKER_CONCURRENCY: "1",
      },
      stdio: "pipe",
    });
    await waitForWorkerReady(workerProcess);
  }, 30_000);

  afterAll(async () => {
    workerProcess.kill("SIGTERM");
    await redis.quit();
    await queueHandle.queue.close();
    await queueHandle.connection.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    assertSafeCleanupTarget();
    await redis.flushdb();
    await queueHandle.queue.drain(true);
    await prisma.contestScore.deleteMany();
    await prisma.contestRegistration.deleteMany();
    await prisma.contestProblem.deleteMany();
    await prisma.submissionResult.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.contest.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("registers, opens a problem, submits a correct solution, gets judged ACCEPTED, and updates the leaderboard", async () => {
    // Admin-side setup (problem/contest creation) is covered by
    // problems.test.ts and contests.test.ts; seeded directly here so
    // this test's focus stays on the contestant-facing chain.
    const problem = await prisma.problem.create({
      data: {
        slug: `e2e-${Date.now()}`,
        title: "E2E Echo",
        supportedLanguages: ["PYTHON"],
        // Generous relative to the schema default (1000ms): this test
        // checks pipeline correctness, not performance, and a
        // freshly-spawned worker's first Docker container has more
        // cold-start jitter than a warmed-up one.
        timeLimitMs: 10_000,
        testCases: { create: [{ input: "hi", expectedOutput: "hi", isSample: true }] },
      },
    });
    const contest = await prisma.contest.create({
      data: {
        name: "E2E Contest",
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId: problem.id, points: 100 }] },
      },
    });

    const registerRes = await request(app).post("/api/v1/auth/register").send({
      email: "e2e@example.com",
      username: "e2econtestant",
      password: "correct-horse-battery",
    });
    expect(registerRes.status).toBe(201);
    const token = registerRes.body.accessToken as string;
    const userId = registerRes.body.user.id as string;

    const problemRes = await request(app).get(`/api/v1/problems/${problem.slug}`);
    expect(problemRes.status).toBe(200);

    const contestRegisterRes = await request(app)
      .post(`/api/v1/contests/${contest.id}/register`)
      .set("Authorization", `Bearer ${token}`);
    expect(contestRegisterRes.status).toBe(204);

    const submitRes = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        problemId: problem.id,
        contestId: contest.id,
        language: "PYTHON",
        sourceCode: "import sys\nsys.stdout.write(sys.stdin.read())\n",
      });
    expect(submitRes.status).toBe(201);
    // The API acknowledges without waiting for judging (PRD §21).
    expect(submitRes.body.status).toBe("QUEUED");

    const finalSubmission = await pollUntilTerminal(app, token, submitRes.body.id as string);
    expect(finalSubmission.status).toBe("COMPLETED");
    expect(finalSubmission.verdict).toBe("ACCEPTED");

    const leaderboardEntry = await pollForLeaderboardEntry(app, contest.id, userId);
    expect(leaderboardEntry.score).toBe(100);
    expect(leaderboardEntry.solvedCount).toBe(1);
  }, 60_000);
});
