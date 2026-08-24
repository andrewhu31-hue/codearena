import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Redis } from "ioredis";
import { assertDedicatedTestDatabase, prisma } from "@codearena/database";
import { loadApiEnv } from "@codearena/config";
import { createApp } from "./app.js";
import { createSubmissionQueue } from "./lib/queue.js";

const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

function assertSafeCleanupTarget() {
  assertDedicatedTestDatabase(process.env.DATABASE_URL ?? "", "API problems test cleanup");
}

describeIfInfra("problems", () => {
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
    assertSafeCleanupTarget();
    await redis.flushdb();
    await prisma.submissionResult.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.problem.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  async function registerAdmin(): Promise<string> {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "admin@example.com",
      username: "adminuser",
      password: "correct-horse-battery",
    });
    await prisma.user.update({ where: { id: register.body.user.id }, data: { role: "ADMIN" } });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "correct-horse-battery" });
    return login.body.accessToken as string;
  }

  const validProblemInput = {
    slug: "sample-problem",
    title: "Sample Problem",
    description: "Add two numbers.",
    difficulty: "EASY",
    supportedLanguages: ["PYTHON", "JAVASCRIPT"],
    sampleTests: [{ input: "1 2", expectedOutput: "3" }],
    hiddenTests: [{ input: "4 5", expectedOutput: "9" }],
  };

  it("lists problems without authentication", async () => {
    await prisma.problem.create({
      data: { slug: "two-sum", title: "Two Sum", supportedLanguages: ["PYTHON"] },
    });

    const res = await request(app).get("/api/v1/problems");
    expect(res.status).toBe(200);
    expect(res.body.problems).toHaveLength(1);
    expect(res.body.problems[0].slug).toBe("two-sum");
  });

  it("returns problem detail with only sample tests, never hidden ones", async () => {
    await prisma.problem.create({
      data: {
        slug: "two-sum",
        title: "Two Sum",
        supportedLanguages: ["PYTHON"],
        testCases: {
          create: [
            { input: "sample-in", expectedOutput: "sample-out", isSample: true },
            { input: "hidden-in", expectedOutput: "hidden-out", isSample: false },
          ],
        },
      },
    });

    const res = await request(app).get("/api/v1/problems/two-sum");
    expect(res.status).toBe(200);
    expect(res.body.sampleTests).toEqual([{ input: "sample-in", expectedOutput: "sample-out" }]);
    expect(JSON.stringify(res.body)).not.toContain("hidden-in");
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await request(app).get("/api/v1/problems/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("rejects problem creation from a non-admin contestant", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "contestant@example.com",
      username: "contestant",
      password: "correct-horse-battery",
    });

    const res = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${register.body.accessToken}`)
      .send(validProblemInput);

    expect(res.status).toBe(403);
  });

  it("lets an admin create a problem and immediately invalidates the list cache", async () => {
    const token = await registerAdmin();

    // Prime the cache with the current (empty) list.
    await request(app).get("/api/v1/problems");

    const createRes = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${token}`)
      .send(validProblemInput);
    expect(createRes.status).toBe(201);
    expect(createRes.body.slug).toBe("sample-problem");

    const listRes = await request(app).get("/api/v1/problems");
    expect(listRes.body.problems.map((p: { slug: string }) => p.slug)).toContain("sample-problem");
  });

  it("lets an admin update a problem's scalar fields", async () => {
    const token = await registerAdmin();
    const created = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${token}`)
      .send(validProblemInput);

    const res = await request(app)
      .patch(`/api/v1/problems/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Renamed Problem" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed Problem");
  });
});
