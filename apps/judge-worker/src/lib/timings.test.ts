import { describe, expect, it } from "vitest";
import { assertQueueWaitMsWithinBound, computeQueueWaitMs } from "./timings.js";

describe("computeQueueWaitMs", () => {
    it("uses Bull enqueue timestamp when present", () => {
        expect(computeQueueWaitMs(5_000, 1_200)).toBe(3_800);
    });

    it("returns zero when enqueue timestamp is absent", () => {
        expect(computeQueueWaitMs(5_000, undefined)).toBe(0);
    });

    it("clamps negative values to zero to avoid clock-skew artifacts", () => {
        expect(computeQueueWaitMs(2_000, 2_500)).toBe(0);
    });

    it("does not use DB createdAt fallback from another clock domain", () => {
        const startedAtMs = 10_000;
        const createdAtMs = 1_000;
        expect(computeQueueWaitMs(startedAtMs, undefined)).toBe(0);
        expect(createdAtMs).toBeLessThan(startedAtMs);
    });
});

describe("assertQueueWaitMsWithinBound", () => {
    it("accepts sane queue wait values", () => {
        expect(() => assertQueueWaitMsWithinBound(3_500, 10_000)).not.toThrow();
    });

    it("throws for out-of-bound queue wait values", () => {
        expect(() => assertQueueWaitMsWithinBound(38_820_826, 600_000)).toThrow(
            /exceeded max expected/,
        );
    });
});
