import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import { loadApiEnv } from "@codearena/config";
import type { Language } from "@codearena/shared";
import { createApp } from "./app.js";
import { createSubmissionQueue } from "./lib/queue.js";

const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

describeIfInfra("submissions", () => {
  let app: Express;
  let redis: Redis;
  let queueHandle: ReturnType<typeof createSubmissionQueue>;

  beforeAll(() => {
    const env = loadApiEnv();
    redis = new Redis(env.REDIS_URL);
    queueHandle = createSubmissionQueue(env);
    app = createApp(env, redis, queueHandle.queue);
  });

  afterAll(async () => {
    await redis.quit();
    await queueHandle.queue.close();
    await queueHandle.connection.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
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
});
