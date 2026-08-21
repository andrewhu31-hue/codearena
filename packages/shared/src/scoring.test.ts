import { describe, expect, it } from "vitest";
import { computeContestScore, PENALTY_MINUTES_PER_WRONG_ATTEMPT } from "./scoring.js";

const start = new Date("2026-01-01T00:00:00Z");
const at = (minutesAfterStart: number) => new Date(start.getTime() + minutesAfterStart * 60_000);

describe("computeContestScore", () => {
  it("awards full points and zero penalty for an immediate accept", () => {
    const result = computeContestScore(
      [{ problemId: "p1", points: 100 }],
      [{ problemId: "p1", verdict: "ACCEPTED", createdAt: at(0) }],
      start,
    );
    expect(result.score).toBe(100);
    expect(result.solvedCount).toBe(1);
    expect(result.penaltyMs).toBe(0);
    expect(result.problems).toEqual([
      { problemId: "p1", attempts: 1, solved: true, penaltyMinutes: 0 },
    ]);
  });

  it("adds time-from-start plus a fixed penalty per wrong attempt before acceptance", () => {
    const result = computeContestScore(
      [{ problemId: "p1", points: 100 }],
      [
        { problemId: "p1", verdict: "WRONG_ANSWER", createdAt: at(5) },
        { problemId: "p1", verdict: "WRONG_ANSWER", createdAt: at(10) },
        { problemId: "p1", verdict: "ACCEPTED", createdAt: at(30) },
      ],
      start,
    );
    expect(result.score).toBe(100);
    expect(result.problems[0]?.penaltyMinutes).toBe(30 + 2 * PENALTY_MINUTES_PER_WRONG_ATTEMPT);
    expect(result.penaltyMs).toBe((30 + 2 * PENALTY_MINUTES_PER_WRONG_ATTEMPT) * 60_000);
  });

  it("does not penalize compilation or internal errors", () => {
    const result = computeContestScore(
      [{ problemId: "p1", points: 100 }],
      [
        { problemId: "p1", verdict: "COMPILATION_ERROR", createdAt: at(1) },
        { problemId: "p1", verdict: "INTERNAL_ERROR", createdAt: at(2) },
        { problemId: "p1", verdict: "ACCEPTED", createdAt: at(3) },
      ],
      start,
    );
    expect(result.problems[0]?.penaltyMinutes).toBe(3);
  });

  it("scores zero for a never-solved problem, with attempts still counted", () => {
    const result = computeContestScore(
      [{ problemId: "p1", points: 100 }],
      [{ problemId: "p1", verdict: "WRONG_ANSWER", createdAt: at(1) }],
      start,
    );
    expect(result.score).toBe(0);
    expect(result.solvedCount).toBe(0);
    expect(result.problems).toEqual([
      { problemId: "p1", attempts: 1, solved: false, penaltyMinutes: null },
    ]);
  });

  it("ignores resubmissions after the first acceptance", () => {
    const result = computeContestScore(
      [{ problemId: "p1", points: 100 }],
      [
        { problemId: "p1", verdict: "ACCEPTED", createdAt: at(5) },
        { problemId: "p1", verdict: "WRONG_ANSWER", createdAt: at(10) },
      ],
      start,
    );
    expect(result.score).toBe(100);
    expect(result.problems[0]?.attempts).toBe(1);
  });

  it("sums independently across multiple problems", () => {
    const result = computeContestScore(
      [
        { problemId: "p1", points: 100 },
        { problemId: "p2", points: 200 },
      ],
      [
        { problemId: "p1", verdict: "ACCEPTED", createdAt: at(0) },
        { problemId: "p2", verdict: "WRONG_ANSWER", createdAt: at(0) },
      ],
      start,
    );
    expect(result.score).toBe(100);
    expect(result.solvedCount).toBe(1);
    expect(result.problems).toHaveLength(2);
  });

  it("is order-independent given the same submissions (idempotent)", () => {
    const submissions = [
      { problemId: "p1", verdict: "WRONG_ANSWER" as const, createdAt: at(10) },
      { problemId: "p1", verdict: "ACCEPTED" as const, createdAt: at(20) },
    ];
    const first = computeContestScore([{ problemId: "p1", points: 100 }], submissions, start);
    const second = computeContestScore(
      [{ problemId: "p1", points: 100 }],
      [...submissions].reverse(),
      start,
    );
    expect(first).toEqual(second);
  });

  it("never produces a negative penalty for a submission created before contest start", () => {
    const result = computeContestScore(
      [{ problemId: "p1", points: 100 }],
      [{ problemId: "p1", verdict: "ACCEPTED", createdAt: at(-5) }],
      start,
    );
    expect(result.problems[0]?.penaltyMinutes).toBe(0);
  });
});
