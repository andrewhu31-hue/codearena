import { describe, expect, it } from "vitest";
import { derivePythonHarnessInfrastructureBudgetMs, verdictForTimeoutCategory } from "./evaluate.js";

describe("verdictForTimeoutCategory", () => {
    it("derives outer harness budget from startup + tests*timeLimit + teardown", () => {
        expect(
            derivePythonHarnessInfrastructureBudgetMs({
                startupAllowanceMs: 60_000,
                timeLimitMs: 5_000,
                testCount: 3,
                teardownAllowanceMs: 5_000,
            }),
        ).toBe(80_000);
    });

    it("maps contestant timeout to TIME_LIMIT_EXCEEDED", () => {
        expect(verdictForTimeoutCategory("contestant_timeout")).toBe("TIME_LIMIT_EXCEEDED");
    });

    it("maps startup timeout to INTERNAL_ERROR", () => {
        expect(verdictForTimeoutCategory("startup_timeout")).toBe("INTERNAL_ERROR");
    });

    it("maps teardown timeout to INTERNAL_ERROR", () => {
        expect(verdictForTimeoutCategory("teardown_timeout")).toBe("INTERNAL_ERROR");
    });

    it("maps none to null", () => {
        expect(verdictForTimeoutCategory("none")).toBeNull();
    });

    it("does not misclassify infrastructure categories under concurrent evaluation", async () => {
        const categories = await Promise.all([
            Promise.resolve("startup_timeout" as const),
            Promise.resolve("teardown_timeout" as const),
            Promise.resolve("contestant_timeout" as const),
            Promise.resolve("none" as const),
        ]);

        const verdicts = categories.map((c) => verdictForTimeoutCategory(c));
        expect(verdicts).toEqual([
            "INTERNAL_ERROR",
            "INTERNAL_ERROR",
            "TIME_LIMIT_EXCEEDED",
            null,
        ]);
    });
});
