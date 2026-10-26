import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Redis } from "ioredis";
import { assertDedicatedTestDatabase, prisma } from "@codearena/database";
import { loadApiEnv } from "@codearena/config";
import { createApp } from "./app.js";
import { createSubmissionQueue } from "./lib/queue.js";
import { AiProviderError, type AiProvider } from "./lib/ai.js";

const hasTestInfra = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const describeIfInfra = hasTestInfra ? describe : describe.skip;

/** Records calls and returns canned answers; never touches the network. */
class FakeProvider implements AiProvider {
  readonly model = "fake-model";
  completeCalls: { system: string; prompt: string }[] = [];
  structuredCalls: { prompt: string; toolName: string }[] = [];
  hintText = (n: number) => `Hint text ${n}`;
  review: unknown = {
    summary: "Clean two-pointer solution.",
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
    strengths: ["Handles empty input"],
    improvements: ["Name variables more clearly"],
    alternativeApproach: "",
  };
  failWith: AiProviderError | null = null;

  async complete(input: { system: string; prompt: string; maxTokens: number }) {
    if (this.failWith) throw this.failWith;
    this.completeCalls.push({ system: input.system, prompt: input.prompt });
    return this.hintText(this.completeCalls.length);
  }

  async completeStructured(input: { prompt: string; toolName: string }) {
    if (this.failWith) throw this.failWith;
    this.structuredCalls.push({ prompt: input.prompt, toolName: input.toolName });
    return this.review;
  }
}

function assertSafeCleanupTarget() {
  assertDedicatedTestDatabase(process.env.DATABASE_URL ?? "", "API AI test cleanup");
}

describeIfInfra("AI hints and code review", () => {
  let env: ReturnType<typeof loadApiEnv>;
  let redis: Redis;
  let queueHandle: ReturnType<typeof createSubmissionQueue>;
  let provider: FakeProvider;
  let app: Express;
  let disabledApp: Express;

  beforeAll(() => {
    env = loadApiEnv();
    redis = new Redis(env.REDIS_URL);
    queueHandle = createSubmissionQueue(env);
    disabledApp = createApp(env, redis, queueHandle.queue, { aiProvider: null });
  });

  afterAll(async () => {
    await redis.quit();
    await queueHandle.queue.close();
    await queueHandle.connection.quit();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    assertSafeCleanupTarget();
    provider = new FakeProvider();
    app = createApp({ ...env, GENERAL_RATE_LIMIT_MAX: 10_000 }, redis, queueHandle.queue, {
      aiProvider: provider,
    });
    await redis.flushdb();
    await queueHandle.queue.drain(true);
    await prisma.codeReview.deleteMany();
    await prisma.hintUnlock.deleteMany();
    await prisma.problemHint.deleteMany();
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

  async function register(name: string): Promise<{ token: string; userId: string }> {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: `${name}@example.com`, username: name, password: "correct-horse-battery" });
    return { token: res.body.accessToken as string, userId: res.body.user.id as string };
  }

  async function seedProblem(slug = "two-sum") {
    return prisma.problem.create({
      data: {
        slug,
        title: "Two Sum",
        description: "Find two numbers that add up to target.",
        supportedLanguages: ["PYTHON"],
        examples: [{ input: "[2,7,11,15] 9", output: "[0,1]" }],
        testCases: {
          create: [
            { input: "[2,7] 9", expectedOutput: "[0,1]", isSample: true },
            {
              input: "SECRET-HIDDEN-INPUT",
              expectedOutput: "SECRET-HIDDEN-OUTPUT",
              isSample: false,
            },
          ],
        },
      },
    });
  }

  async function seedSubmission(
    userId: string,
    problemId: string,
    verdict: "ACCEPTED" | "WRONG_ANSWER",
  ) {
    return prisma.submission.create({
      data: {
        userId,
        problemId,
        language: "PYTHON",
        sourceCode: "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n",
        status: "COMPLETED",
        verdict,
        testsPassed: verdict === "ACCEPTED" ? 2 : 1,
        testsTotal: 2,
        runtimeMs: 12,
      },
    });
  }

  async function putInContest(problemId: string, start: number, end: number) {
    return prisma.contest.create({
      data: {
        name: "Weekly",
        startTime: new Date(Date.now() + start),
        endTime: new Date(Date.now() + end),
        visibility: "PUBLIC",
        contestProblems: { create: [{ problemId }] },
      },
    });
  }

  it("reports whether AI is enabled", async () => {
    expect((await request(app).get("/api/v1/ai/status")).body).toEqual({ enabled: true });
    expect((await request(disabledApp).get("/api/v1/ai/status")).body).toEqual({ enabled: false });
  });

  it("requires authentication", async () => {
    await seedProblem();
    expect((await request(app).get("/api/v1/ai/problems/two-sum/hints")).status).toBe(401);
    expect(
      (await request(app).post("/api/v1/ai/problems/two-sum/hints").send({ level: 1 })).status,
    ).toBe(401);
  });

  it("unlocks hints strictly in order and never sends hidden tests to the model", async () => {
    await seedProblem();
    const { token } = await register("alice");
    const auth = { Authorization: `Bearer ${token}` };

    const empty = await request(app).get("/api/v1/ai/problems/two-sum/hints").set(auth);
    expect(empty.body).toMatchObject({ hints: [], nextLevel: 1, blockedReason: null });

    const skip = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set(auth)
      .send({ level: 2 });
    expect(skip.status).toBe(400);
    expect(provider.completeCalls).toHaveLength(0);

    const first = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set(auth)
      .send({ level: 1 });
    expect(first.status).toBe(200);
    expect(first.body.hints).toEqual([{ level: 1, label: "Nudge", content: "Hint text 1" }]);
    expect(first.body.nextLevel).toBe(2);

    const second = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set(auth)
      .send({ level: 2 });
    expect(second.body.hints.map((h: { level: number }) => h.level)).toEqual([1, 2]);
    // Level 2 is generated with level 1 as context.
    expect(provider.completeCalls[1]?.prompt).toContain("Hint 1: Hint text 1");

    for (const call of provider.completeCalls) {
      expect(call.prompt).toContain("Find two numbers");
      expect(call.prompt).not.toContain("SECRET-HIDDEN");
    }
  });

  it("generates each hint once and reuses it for other users", async () => {
    await seedProblem();
    const a = await register("alice");
    const b = await register("bob");
    await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set({ Authorization: `Bearer ${a.token}` })
      .send({ level: 1 });
    const res = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set({ Authorization: `Bearer ${b.token}` })
      .send({ level: 1 });
    expect(res.body.hints[0].content).toBe("Hint text 1");
    expect(provider.completeCalls).toHaveLength(1);

    // Re-requesting an unlocked level is free and idempotent.
    const again = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set({ Authorization: `Bearer ${b.token}` })
      .send({ level: 1 });
    expect(again.status).toBe(200);
    expect(again.body.hints).toHaveLength(1);
    expect(provider.completeCalls).toHaveLength(1);
  });

  it("strips code blocks from hints", async () => {
    await seedProblem();
    provider.hintText = () =>
      "Think about complements.\n```python\nseen = {}\n```\nUse a hash map.";
    const { token } = await register("alice");
    const res = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set({ Authorization: `Bearer ${token}` })
      .send({ level: 1 });
    expect(res.body.hints[0].content).not.toContain("```");
    expect(res.body.hints[0].content).not.toContain("seen = {}");
  });

  it("blocks hints for problems in a live or upcoming contest, and allows them after it ends", async () => {
    const problem = await seedProblem();
    const { token, userId } = await register("alice");
    const auth = { Authorization: `Bearer ${token}` };
    await prisma.hintUnlock.create({ data: { userId, problemId: problem.id, level: 1 } });
    await prisma.problemHint.create({
      data: { problemId: problem.id, level: 1, content: "old", model: "x" },
    });

    const live = await putInContest(problem.id, -60_000, 3_600_000);
    const blocked = await request(app).get("/api/v1/ai/problems/two-sum/hints").set(auth);
    expect(blocked.body.blockedReason).toMatch(/contest/);
    expect(blocked.body.hints).toEqual([]); // even already-unlocked hints are hidden
    const post = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set(auth)
      .send({ level: 2 });
    expect(post.status).toBe(403);

    await prisma.contest.update({
      where: { id: live.id },
      data: { startTime: new Date(Date.now() + 60_000) },
    });
    expect(
      (await request(app).post("/api/v1/ai/problems/two-sum/hints").set(auth).send({ level: 2 }))
        .status,
    ).toBe(403);

    await prisma.contest.update({
      where: { id: live.id },
      data: {
        startTime: new Date(Date.now() - 7_200_000),
        endTime: new Date(Date.now() - 3_600_000),
      },
    });
    const after = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set(auth)
      .send({ level: 2 });
    expect(after.status).toBe(200);
    expect(after.body.hints.map((h: { level: number }) => h.level)).toEqual([1, 2]);
    expect(provider.completeCalls).toHaveLength(1);
  });

  it("returns 503 with a readable message when AI is disabled or fails", async () => {
    await seedProblem();
    const { token } = await register("alice");
    const disabled = await request(disabledApp)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set({ Authorization: `Bearer ${token}` })
      .send({ level: 1 });
    expect(disabled.status).toBe(503);
    expect(disabled.body.error.code).toBe("AI_UNAVAILABLE");

    provider.failWith = new AiProviderError(
      "Couldn't reach the AI service. Try again in a moment.",
      true,
    );
    const failed = await request(app)
      .post("/api/v1/ai/problems/two-sum/hints")
      .set({ Authorization: `Bearer ${token}` })
      .send({ level: 1 });
    expect(failed.status).toBe(503);
    expect(failed.body.error.message).toMatch(/Couldn't reach/);
    // A failed generation unlocks nothing.
    const state = await request(app)
      .get("/api/v1/ai/problems/two-sum/hints")
      .set({ Authorization: `Bearer ${token}` });
    expect(state.body.hints).toEqual([]);
  });

  it("validates the hint level", async () => {
    await seedProblem();
    const { token } = await register("alice");
    for (const level of [0, 4, "1", null]) {
      const res = await request(app)
        .post("/api/v1/ai/problems/two-sum/hints")
        .set({ Authorization: `Bearer ${token}` })
        .send({ level });
      expect(res.status).toBe(400);
    }
    const missing = await request(app)
      .post("/api/v1/ai/problems/nope/hints")
      .set({ Authorization: `Bearer ${token}` })
      .send({ level: 1 });
    expect(missing.status).toBe(404);
  });

  it("reviews an accepted submission once, then serves the stored review", async () => {
    const problem = await seedProblem();
    const { token, userId } = await register("alice");
    const submission = await seedSubmission(userId, problem.id, "ACCEPTED");
    const auth = { Authorization: `Bearer ${token}` };

    expect(
      (await request(app).get(`/api/v1/ai/submissions/${submission.id}/review`).set(auth)).status,
    ).toBe(404);

    const res = await request(app).post(`/api/v1/ai/submissions/${submission.id}/review`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.review).toMatchObject({ timeComplexity: "O(n)", alternativeApproach: null });
    expect(res.body.model).toBe("fake-model");
    expect(provider.structuredCalls[0]?.prompt).toContain("class Solution");
    expect(provider.structuredCalls[0]?.prompt).not.toContain("SECRET-HIDDEN");

    await request(app).post(`/api/v1/ai/submissions/${submission.id}/review`).set(auth);
    const stored = await request(app)
      .get(`/api/v1/ai/submissions/${submission.id}/review`)
      .set(auth);
    expect(stored.status).toBe(200);
    expect(provider.structuredCalls).toHaveLength(1);
  });

  it("refuses reviews for non-accepted, foreign, or contest-pending submissions", async () => {
    const problem = await seedProblem();
    const alice = await register("alice");
    const bob = await register("bob");
    const wrong = await seedSubmission(alice.userId, problem.id, "WRONG_ANSWER");
    const accepted = await seedSubmission(alice.userId, problem.id, "ACCEPTED");

    expect(
      (
        await request(app)
          .post(`/api/v1/ai/submissions/${wrong.id}/review`)
          .set({ Authorization: `Bearer ${alice.token}` })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/ai/submissions/${accepted.id}/review`)
          .set({ Authorization: `Bearer ${bob.token}` })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/ai/submissions/not-a-real-id/review`)
          .set({ Authorization: `Bearer ${alice.token}` })
      ).status,
    ).toBe(404);

    await putInContest(problem.id, -60_000, 3_600_000);
    expect(
      (
        await request(app)
          .post(`/api/v1/ai/submissions/${accepted.id}/review`)
          .set({ Authorization: `Bearer ${alice.token}` })
      ).status,
    ).toBe(403);
    expect(provider.structuredCalls).toHaveLength(0);
  });

  it("rejects a malformed review from the model instead of storing it", async () => {
    const problem = await seedProblem();
    const { token, userId } = await register("alice");
    const submission = await seedSubmission(userId, problem.id, "ACCEPTED");
    provider.review = { summary: "", strengths: "not a list" };
    const res = await request(app)
      .post(`/api/v1/ai/submissions/${submission.id}/review`)
      .set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(503);
    expect(await prisma.codeReview.count()).toBe(0);
  });

  it("rate-limits calls that can reach the model, per user", async () => {
    const limited = createApp(
      { ...env, GENERAL_RATE_LIMIT_MAX: 10_000, AI_RATE_LIMIT_MAX: 2 },
      redis,
      queueHandle.queue,
      {
        aiProvider: provider,
      },
    );
    await seedProblem();
    const { token } = await register("alice");
    const auth = { Authorization: `Bearer ${token}` };
    const codes = [];
    for (let i = 0; i < 3; i++) {
      codes.push(
        (
          await request(limited)
            .post("/api/v1/ai/problems/two-sum/hints")
            .set(auth)
            .send({ level: 1 })
        ).status,
      );
    }
    expect(codes).toEqual([200, 200, 429]);
    // Reading unlocked hints isn't limited.
    expect((await request(limited).get("/api/v1/ai/problems/two-sum/hints").set(auth)).status).toBe(
      200,
    );
  });
});
