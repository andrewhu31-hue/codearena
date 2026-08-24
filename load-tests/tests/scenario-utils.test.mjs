import test from "node:test";
import assert from "node:assert/strict";
import {
    buildIdempotencyKey,
    computeBackoffDelayMs,
    mapVuToUser,
    parseRetryAfterToMs,
} from "../lib/scenario-utils.mjs";

test("mapVuToUser deterministically maps 1..N", () => {
    const users = [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }];
    assert.equal(mapVuToUser(1, users).userId, "u1");
    assert.equal(mapVuToUser(2, users).userId, "u2");
    assert.equal(mapVuToUser(3, users).userId, "u3");
    assert.equal(mapVuToUser(4, users).userId, "u1");
});

test("buildIdempotencyKey is stable for same inputs", () => {
    const first = buildIdempotencyKey("runA", "user-1");
    const second = buildIdempotencyKey("runA", "user-1");
    assert.equal(first, second);
});

test("parseRetryAfterToMs parses delta-seconds", () => {
    assert.equal(parseRetryAfterToMs("5", 0), 5000);
    assert.equal(parseRetryAfterToMs("0", 0), 0);
});

test("parseRetryAfterToMs parses HTTP-date", () => {
    const nowMs = Date.parse("2026-01-01T00:00:00Z");
    const retryDate = new Date(nowMs + 7000).toUTCString();
    const parsed = parseRetryAfterToMs(retryDate, nowMs);
    assert.equal(parsed, 7000);
});

test("computeBackoffDelayMs grows exponentially and respects cap", () => {
    const deterministicRng = () => 0;
    const d0 = computeBackoffDelayMs({
        attempt: 0,
        baseMs: 500,
        capMs: 8000,
        jitterRatio: 0.2,
        rng: deterministicRng,
    });
    const d1 = computeBackoffDelayMs({
        attempt: 1,
        baseMs: 500,
        capMs: 8000,
        jitterRatio: 0.2,
        rng: deterministicRng,
    });
    const d4 = computeBackoffDelayMs({
        attempt: 4,
        baseMs: 500,
        capMs: 8000,
        jitterRatio: 0.2,
        rng: deterministicRng,
    });
    const d9 = computeBackoffDelayMs({
        attempt: 9,
        baseMs: 500,
        capMs: 8000,
        jitterRatio: 0.2,
        rng: deterministicRng,
    });

    assert.equal(d0, 500);
    assert.equal(d1, 1000);
    assert.equal(d4, 8000);
    assert.equal(d9, 8000);
});

test("computeBackoffDelayMs honors Retry-After floor", () => {
    const delay = computeBackoffDelayMs({
        attempt: 0,
        baseMs: 500,
        capMs: 15000,
        jitterRatio: 0,
        rng: () => 0,
        retryAfterMs: 6000,
    });
    assert.equal(delay, 6000);
});
