import { describe, expect, it } from "vitest";
import { evaluateSubmission } from "./mockEvaluator.js";

const testCases = [
  { id: "t1", input: "1", expectedOutput: "one" },
  { id: "t2", input: "2", expectedOutput: "two" },
];

describe("evaluateSubmission", () => {
  it("defaults to ACCEPTED and passes every test when there is no directive", () => {
    const result = evaluateSubmission("print(input())", testCases);
    expect(result.verdict).toBe("ACCEPTED");
    expect(result.testResults).toHaveLength(2);
    expect(result.testResults.every((r) => r.passed)).toBe(true);
  });

  it("reads a // directive and fails every test", () => {
    const result = evaluateSubmission(
      "// CODEARENA_VERDICT: WRONG_ANSWER\nconsole.log(1)",
      testCases,
    );
    expect(result.verdict).toBe("WRONG_ANSWER");
    expect(result.testResults.every((r) => !r.passed)).toBe(true);
  });

  it("reads a # directive", () => {
    const result = evaluateSubmission(
      "# CODEARENA_VERDICT: TIME_LIMIT_EXCEEDED\nprint(1)",
      testCases,
    );
    expect(result.verdict).toBe("TIME_LIMIT_EXCEEDED");
  });

  it("falls back to ACCEPTED for an unrecognized directive value", () => {
    const result = evaluateSubmission("// CODEARENA_VERDICT: NOT_A_REAL_VERDICT", testCases);
    expect(result.verdict).toBe("ACCEPTED");
  });

  it("is deterministic for the same input", () => {
    const source = "// CODEARENA_VERDICT: RUNTIME_ERROR";
    const first = evaluateSubmission(source, testCases);
    const second = evaluateSubmission(source, testCases);
    expect(first).toEqual(second);
  });
});
