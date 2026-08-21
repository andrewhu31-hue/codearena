import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import { loadApiEnv } from "@codearena/config";
import { createApp } from "./app.js";
import { createSubmissionQueue } from "./lib/queue.js";

const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

describeIfInfra("contests", () => {
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

  async function registerUser(email: string, username: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email, username, password: "correct-horse-battery" });
    return res.body.accessToken as string;
  }

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

  async function seedProblem() {
    return prisma.problem.create({
      data: {
        slug: `problem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: "A Problem",
        supportedLanguages: ["PYTHON"],
      },
    });
  }

  it("lets an admin create a contest with problems", async () => {
    const token = await registerAdmin();
    const problem = await seedProblem();

    const res = await request(app)
      .post("/api/v1/contests")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Weekly Contest",
        startTime: new Date(Date.now() + 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        visibility: "PUBLIC",
        problems: [{ problemId: problem.id, points: 100, order: 0 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.problems).toHaveLength(1);
    expect(res.body.status).toBe("UPCOMING");
  });

  it("rejects contest creation from a non-admin", async () => {
    const token = await registerUser("contestant@example.com", "contestant");
    const res = await request(app)
      .post("/api/v1/contests")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Weekly Contest",
        startTime: new Date(Date.now() + 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
      });
    expect(res.status).toBe(403);
  });

  it("only lists PUBLIC contests to non-admins, but all to admins", async () => {
    const adminToken = await registerAdmin();
    await prisma.contest.create({
      data: {
        name: "Public Contest",
        startTime: new Date(),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
      },
    });
    await prisma.contest.create({
      data: {
        name: "Private Contest",
        startTime: new Date(),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PRIVATE",
      },
    });

    const anonRes = await request(app).get("/api/v1/contests");
    expect(anonRes.body.contests).toHaveLength(1);
    expect(anonRes.body.contests[0].name).toBe("Public Contest");

    const adminRes = await request(app)
      .get("/api/v1/contests")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.body.contests).toHaveLength(2);
  });

  it("hides a private contest's detail from an unregistered, non-admin user", async () => {
    const token = await registerUser("outsider@example.com", "outsider");
    const contest = await prisma.contest.create({
      data: {
        name: "Private Contest",
        startTime: new Date(),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PRIVATE",
      },
    });

    const res = await request(app)
      .get(`/api/v1/contests/${contest.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("lets a user register once and rejects a duplicate registration", async () => {
    const token = await registerUser("solver@example.com", "solver");
    const contest = await prisma.contest.create({
      data: {
        name: "Contest",
        startTime: new Date(),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
      },
    });

    const first = await request(app)
      .post(`/api/v1/contests/${contest.id}/register`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(204);

    const second = await request(app)
      .post(`/api/v1/contests/${contest.id}/register`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(409);

    const detail = await request(app)
      .get(`/api/v1/contests/${contest.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.body.isRegistered).toBe(true);
  });

  it("enforces contest timing server-side regardless of the client", async () => {
    const token = await registerUser("timer@example.com", "timer");
    const problem = await seedProblem();
    const futureContest = await prisma.contest.create({
      data: {
        name: "Not Started Yet",
        startTime: new Date(Date.now() + 3_600_000),
        endTime: new Date(Date.now() + 7_200_000),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId: problem.id, points: 100 }] },
      },
    });
    await prisma.contestRegistration.create({
      data: {
        contestId: futureContest.id,
        userId: (await prisma.user.findUniqueOrThrow({ where: { email: "timer@example.com" } })).id,
      },
    });

    const res = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        problemId: problem.id,
        contestId: futureContest.id,
        language: "PYTHON",
        sourceCode: "print(1)",
      });

    expect(res.status).toBe(400);
  });

  it("rejects a contest submission from a user who never registered", async () => {
    const token = await registerUser("unregistered@example.com", "unregistered");
    const problem = await seedProblem();
    const contest = await prisma.contest.create({
      data: {
        name: "Active Contest",
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId: problem.id, points: 100 }] },
      },
    });

    const res = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        problemId: problem.id,
        contestId: contest.id,
        language: "PYTHON",
        sourceCode: "print(1)",
      });

    expect(res.status).toBe(400);
  });

  it("rejects a contest submission for a problem that isn't part of the contest", async () => {
    const token = await registerUser("wrongproblem@example.com", "wrongproblem");
    const inContest = await seedProblem();
    const notInContest = await seedProblem();
    const contest = await prisma.contest.create({
      data: {
        name: "Active Contest",
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId: inContest.id, points: 100 }] },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "wrongproblem@example.com" },
    });
    await prisma.contestRegistration.create({ data: { contestId: contest.id, userId: user.id } });

    const res = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        problemId: notInContest.id,
        contestId: contest.id,
        language: "PYTHON",
        sourceCode: "print(1)",
      });

    expect(res.status).toBe(400);
  });

  it("accepts a submission during an active, registered contest window", async () => {
    const token = await registerUser("active@example.com", "active");
    const problem = await seedProblem();
    const contest = await prisma.contest.create({
      data: {
        name: "Active Contest",
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId: problem.id, points: 100 }] },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "active@example.com" } });
    await prisma.contestRegistration.create({ data: { contestId: contest.id, userId: user.id } });

    const res = await request(app)
      .post("/api/v1/submissions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        problemId: problem.id,
        contestId: contest.id,
        language: "PYTHON",
        sourceCode: "print(1)",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("QUEUED");
  });

  it("serves the leaderboard from Postgres-backed data, ranked by score then penalty", async () => {
    const contest = await prisma.contest.create({
      data: {
        name: "Scored Contest",
        startTime: new Date(Date.now() - 3_600_000),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
      },
    });
    const alice = await prisma.user.create({
      data: { email: "alice-lb@example.com", username: "alicelb", passwordHash: "x" },
    });
    const bob = await prisma.user.create({
      data: { email: "bob-lb@example.com", username: "boblb", passwordHash: "x" },
    });
    await prisma.contestScore.createMany({
      data: [
        { contestId: contest.id, userId: alice.id, score: 200, solvedCount: 2, penaltyMs: 600_000 },
        { contestId: contest.id, userId: bob.id, score: 200, solvedCount: 2, penaltyMs: 300_000 },
      ],
    });

    const res = await request(app).get(`/api/v1/contests/${contest.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    // Same score: lower penalty ranks first.
    expect(res.body.entries[0].username).toBe("boblb");
    expect(res.body.entries[0].rank).toBe(1);
    expect(res.body.entries[1].username).toBe("alicelb");
  });

  it("rebuilds the leaderboard cache from Postgres when Redis has no data for it", async () => {
    const contest = await prisma.contest.create({
      data: {
        name: "Cache Rebuild Contest",
        startTime: new Date(Date.now() - 3_600_000),
        endTime: new Date(Date.now() + 3_600_000),
        visibility: "PUBLIC",
      },
    });
    const user = await prisma.user.create({
      data: { email: "cache@example.com", username: "cacheuser", passwordHash: "x" },
    });
    await prisma.contestScore.create({
      data: { contestId: contest.id, userId: user.id, score: 100, solvedCount: 1, penaltyMs: 0 },
    });

    // Redis was flushed in beforeEach, so the cache starts empty — this
    // exercises the rebuild-from-Postgres path (PRD §13).
    const res = await request(app).get(`/api/v1/contests/${contest.id}/leaderboard`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].username).toBe("cacheuser");

    const cached = await redis.zrevrange(`leaderboard:${contest.id}`, 0, -1);
    expect(cached).toEqual([user.id]);
  });
});
