import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Redis } from "ioredis";
import { assertDedicatedTestDatabase, prisma } from "@codearena/database";
import { loadApiEnv } from "@codearena/config";
import type { Language } from "@codearena/shared";
import { createApp } from "./app.js";
import { createSubmissionQueue } from "./lib/queue.js";
import { signAccessToken } from "./lib/jwt.js";

const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

function assertSafeCleanupTarget() {
  assertDedicatedTestDatabase(process.env.DATABASE_URL ?? "", "API submissions test cleanup");
}

describeIfInfra("submissions", () => {
  let app: Express;
  let limiterKeyingApp: Express;
  let env: ReturnType<typeof loadApiEnv>;
  let redis: Redis;
  let queueHandle: ReturnType<typeof createSubmissionQueue>;

  beforeAll(() => {
    env = loadApiEnv();
    redis = new Redis(env.REDIS_URL);
    queueHandle = createSubmissionQueue(env);
    app = createApp(env, redis, queueHandle.queue);
    limiterKeyingApp = createApp(
      {
        ...env,
        // Keep the global IP limiter effectively out of the way so these
        // tests isolate submission limiter keying semantics.
        GENERAL_RATE_LIMIT_MAX: 10000,
        SUBMISSION_RATE_LIMIT_MAX: 1,
        SUBMISSION_RATE_LIMIT_WINDOW_MS: 10 * 60 * 1000,
      },
      redis,
      queueHandle.queue,
    );
  });

  afterAll(async () => {
    await redis.quit();
    await queueHandle.queue.close();
    await queueHandle.connection.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    assertSafeCleanupTarget();
    await redis.flushdb();
    await queueHandle.queue.drain(true);
    await prisma.submissionResult.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  async function registerAndLogin(email: string, username: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, username, password: "correct-horse-battery" });
    return res.body.accessToken as string;
  }

  async function seedProblem(languages: Language[] = ["PYTHON"]) {
    return prisma.problem.create({
      data: {
        slug: `problem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: "A Problem",
        supportedLanguages: languages,
        testCases: { create: [{ input: "1", expectedOutput: "1", isSample: true }] },
      },
    });
  }

  async function createUserToken(email: string, username: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: "not-used-in-this-test",
      },
    });
    return signAccessToken(env, { sub: user.id, role: "CONTESTANT" });
  }

  it("acknowledges a submission without waiting for it to be judged", async () => {
    const token = await registerAndLogin("solver@example.com", "solver");
    const problem = await seedProblem();

    const res = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("QUEUED");
    expect(res.body.verdict).toBeNull();

    const stored = await prisma.submission.findUnique({ where: { id: res.body.id } });
    expect(stored?.status).toBe("QUEUED");
  });

  it("replays the original submission for duplicate POSTs with the same Idempotency-Key", async () => {
    const token = await registerAndLogin("idem@example.com", "idemuser");
    const problem = await seedProblem();
    const idempotencyKey = `idem-${Date.now()}`;

    const first = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const count = await prisma.submission.count({
      where: {
        userId: (await prisma.user.findUniqueOrThrow({ where: { email: "idem@example.com" } })).id,
        problemId: problem.id,
      },
    });
    expect(count).toBe(1);
  });

  it("returns exactly 1x201 and 9x200 for 10 concurrent duplicate idempotency requests", async () => {
    const token = await registerAndLogin("idem-concurrent@example.com", "idemconcurrent");
    const problem = await seedProblem();
    const idempotencyKey = `idem-concurrent-${Date.now()}`;

    const requests = Array.from({ length: 10 }, () =>
      request(app)
        .post("/api/v1/submissions")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" }),
    );

    const responses = await Promise.all(requests);

    const statusCounts = responses.reduce<Record<number, number>>((acc, res) => {
      acc[res.status] = (acc[res.status] ?? 0) + 1;
      return acc;
    }, {});

    expect(statusCounts[201] ?? 0).toBe(1);
    expect(statusCounts[200] ?? 0).toBe(9);
    expect(statusCounts[409] ?? 0).toBe(0);

    const uniqueSubmissionIds = new Set(responses.map((res) => res.body.id));
    expect(uniqueSubmissionIds.size).toBe(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "idem-concurrent@example.com" } });
    const count = await prisma.submission.count({
      where: {
        userId: user.id,
        idempotencyKey,
      },
    });
    expect(count).toBe(1);
  });

  it("rejects a submission in an unsupported language for the problem", async () => {
    const token = await registerAndLogin("solver2@example.com", "solver2");
    const problem = await seedProblem(["CPP"]);

    const res = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });

    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated submission", async () => {
    const problem = await seedProblem();
    const res = await request(app)
      .post("/api/v1/submissions")
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });
    expect(res.status).toBe(401);
  });

  it("lets the owner read their submission but forbids other contestants", async () => {
    const ownerToken = await registerAndLogin("owner@example.com", "owner");
    const otherToken = await registerAndLogin("other@example.com", "other");
    const problem = await seedProblem();

    const created = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });

    const ownRes = await request(app)
      .get(`/api/v1/submissions/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.sourceCode).toBe("print(1)");

    const otherRes = await request(app)
      .get(`/api/v1/submissions/${created.body.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherRes.status).toBe(403);
  });

  it("lists only the current user's submissions, newest first", async () => {
    const token = await registerAndLogin("history@example.com", "historyuser");
    const otherToken = await registerAndLogin("other2@example.com", "other2");
    const problem = await seedProblem();

    await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });
    await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(2)" });
    await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(3)" });

    const res = await request(app)
      .get("/api/v1/users/me/submissions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.submissions).toHaveLength(2);
    expect(new Date(res.body.submissions[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(res.body.submissions[1].createdAt).getTime(),
    );
  });

  it("allows 100 distinct authenticated users behind one IP to each submit once", async () => {
    const problem = await seedProblem();
    const tokens = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        createUserToken(`shared-ip-${i}@example.com`, `shared_ip_${i}`),
      ),
    );

    const responses = await Promise.all(
      tokens.map((token) =>
        request(limiterKeyingApp)
          .post("/api/v1/submissions")
          .set("Authorization", `Bearer ${token}`)
          .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" }),
      ),
    );

    const byStatus = responses.reduce<Record<number, number>>((acc, res) => {
      acc[res.status] = (acc[res.status] ?? 0) + 1;
      return acc;
    }, {});

    expect(byStatus[201] ?? 0).toBe(100);
    expect(byStatus[429] ?? 0).toBe(0);
  }, 60_000);

  it("rate-limits one user when they exceed their personal submission quota", async () => {
    const token = await createUserToken("single-user-limit@example.com", "single_user_limit");
    const problem = await seedProblem();

    const first = await request(limiterKeyingApp)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });
    expect(first.status).toBe(201);

    const second = await request(limiterKeyingApp)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(2)" });

    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("RATE_LIMITED");
  });

  it("does not let users behind the same IP consume each other's submission quota", async () => {
    const tokenA = await createUserToken("shared-quota-a@example.com", "shared_quota_a");
    const tokenB = await createUserToken("shared-quota-b@example.com", "shared_quota_b");
    const problem = await seedProblem();

    const userAFirst = await request(limiterKeyingApp)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });
    expect(userAFirst.status).toBe(201);

    const userBFirst = await request(limiterKeyingApp)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(1)" });
    expect(userBFirst.status).toBe(201);

    const userASecond = await request(limiterKeyingApp)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ problemId: problem.id, language: "PYTHON", sourceCode: "print(3)" });
    expect(userASecond.status).toBe(429);
  });
});
