import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Redis } from "ioredis";
import { assertDedicatedTestDatabase, prisma } from "@codearena/database";
import { loadApiEnv } from "@codearena/config";
import { createApp } from "./app.js";
import { createSubmissionQueue } from "./lib/queue.js";

/**
 * Integration tests against a real Postgres + Redis, as started by
 * `docker compose up postgres redis` (see README). They are skipped
 * automatically when DATABASE_URL/REDIS_URL aren't configured for a test
 * database, so `npm test` stays runnable without infra for unrelated
 * workspaces.
 */
const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

function assertSafeCleanupTarget() {
  assertDedicatedTestDatabase(process.env.DATABASE_URL ?? "", "API auth test cleanup");
}

describeIfInfra("auth flow", () => {
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
    // Register/login are rate-limited per IP in Redis; without a reset here,
    // tests would exhaust the real limit partway through the suite.
    await redis.flushdb();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("registers a new user and returns an access token", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "new@example.com",
      username: "newuser",
      password: "correct-horse-battery",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("new@example.com");
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]?.[0]).toMatch(/refreshToken=/);
  });

  it("rejects duplicate registration with 409", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "dup@example.com",
      username: "dupuser",
      password: "correct-horse-battery",
    });

    const res = await request(app).post("/api/v1/auth/register").send({
      email: "dup@example.com",
      username: "otheruser",
      password: "correct-horse-battery",
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("logs in and can fetch /me with the access token", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "login@example.com",
      username: "loginuser",
      password: "correct-horse-battery",
    });

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "login@example.com",
      password: "correct-horse-battery",
    });
    expect(loginRes.status).toBe(200);

    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe("loginuser");
  });

  it("returns a generic 401 for wrong password", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "wrong@example.com",
      username: "wronguser",
      password: "correct-horse-battery",
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "wrong@example.com", password: "not-the-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects /me without a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("rotates the refresh token and rejects the old one on replay", async () => {
    const registerRes = await request(app).post("/api/v1/auth/register").send({
      email: "rotate@example.com",
      username: "rotateuser",
      password: "correct-horse-battery",
    });
    const originalCookie = registerRes.headers["set-cookie"]?.[0];
    if (!originalCookie) throw new Error("Expected a Set-Cookie header on register");

    const first = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie)
      .send();
    expect(first.status).toBe(200);

    // The pre-rotation cookie was revoked when it was used above, so
    // replaying it must now fail.
    const replay = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie)
      .send();
    expect(replay.status).toBe(401);
  });

  it("rate-limits registration per IP and reports Retry-After", async () => {
    // Registration is capped at 5/hour/IP (apps/api/src/routes/auth.routes.ts).
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: `ratelimit${i}@example.com`,
          username: `ratelimit${i}`,
          password: "correct-horse-battery",
        });
      expect(res.status).toBe(201);
    }

    const blocked = await request(app).post("/api/v1/auth/register").send({
      email: "ratelimit5@example.com",
      username: "ratelimit5",
      password: "correct-horse-battery",
    });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
  }, 20_000);
});
