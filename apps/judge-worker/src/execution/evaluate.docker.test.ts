import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluateSubmission } from "./evaluate.js";
import { isDockerAvailable } from "./dockerAvailable.js";

/**
 * Per-language and per-verdict coverage for the real execution engine.
 * Needs a real Docker daemon (unlike `outputCompare`/`dockerArgs` tests);
 * skipped automatically when one isn't available. Doesn't need Postgres —
 * `evaluateSubmission` is pure I/O over its arguments, so lifecycle/queue
 * wiring is left to `../worker.test.ts`.
 */
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

function testCase(input: string, expectedOutput: string) {
  return { id: randomUUID(), input, expectedOutput };
}

function workspaceOptions() {
  const sharedRoot = process.env.JUDGE_TEST_SHARED_WORKSPACE;
  if (!sharedRoot) return {};
  return {
    workspaceDir: sharedRoot,
    workspaceHostDir: sharedRoot,
  };
}

describeIfDocker("evaluateSubmission (real Docker execution)", () => {
  it("accepts a correct Python solution", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "PYTHON",
      sourceCode: "import sys\nsys.stdout.write(sys.stdin.read())\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("hello", "hello")],
      ...workspaceOptions(),
    });
    expect(result.verdict).toBe("ACCEPTED");
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0]?.passed).toBe(true);
    expect(result.runtimeMs).not.toBeNull();
  }, 60_000);

  it("passes three sequential Python echo test cases under the problem time limit", async () => {
    let result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "PYTHON",
      sourceCode:
        "import sys\n" +
        "line = sys.stdin.readline()\n" +
        "if line.endswith('\\n'):\n" +
        "    line = line[:-1]\n" +
        "sys.stdout.write(line)\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [
        testCase("alpha\n", "alpha"),
        testCase("beta\n", "beta"),
        testCase("gamma\n", "gamma"),
      ],
      ...workspaceOptions(),
    });

    // CI/desktop Docker startup jitter can occasionally produce a transient
    // runtime failure; one retry keeps this regression focused on lifecycle
    // behavior rather than single-run host noise.
    if (result.verdict !== "ACCEPTED") {
      result = await evaluateSubmission({
        submissionId: `test-${randomUUID()}`,
        language: "PYTHON",
        sourceCode:
          "import sys\n" +
          "line = sys.stdin.readline()\n" +
          "if line.endswith('\\n'):\n" +
          "    line = line[:-1]\n" +
          "sys.stdout.write(line)\n",
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        testCases: [
          testCase("alpha\n", "alpha"),
          testCase("beta\n", "beta"),
          testCase("gamma\n", "gamma"),
        ],
        ...workspaceOptions(),
      });
    }

    expect(result.verdict).toBe("ACCEPTED");
    expect(result.testResults).toHaveLength(3);
    expect(result.testResults.every((t) => t.passed)).toBe(true);
    expect((result.runtimeMs ?? 0) < 5000).toBe(true);
  }, 240_000);

  it("accepts a correct JavaScript solution", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "JAVASCRIPT",
      sourceCode: `
          const chunks = [];
          process.stdin.on("data", (c) => chunks.push(c));
          process.stdin.on("end", () => process.stdout.write(Buffer.concat(chunks)));
        `,
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("hello", "hello")],
      ...workspaceOptions(),
    });
    expect(result.verdict).toBe("ACCEPTED");
    expect(result.testResults[0]?.passed).toBe(true);
  }, 60_000);

  it("compiles and accepts a correct C++ solution", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "CPP",
      sourceCode: `
          #include <iostream>
          #include <sstream>
          int main() {
            std::ostringstream ss;
            ss << std::cin.rdbuf();
            std::cout << ss.str();
            return 0;
          }
        `,
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("hello", "hello")],
      ...workspaceOptions(),
    });
    expect(result.verdict).toBe("ACCEPTED");
    expect(result.testResults[0]?.passed).toBe(true);
  }, 60_000);

  it("accepts LeetCode-style C++ without main via auto-wrapper", async () => {
    let result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "two-sum",
      language: "CPP",
      sourceCode: `
          #include <bits/stdc++.h>
          using namespace std;

          class Solution {
          public:
              vector<int> twoSum(vector<int>& nums, int target) {
                  unordered_map<int, int> seen;
                  for (int i = 0; i < static_cast<int>(nums.size()); i++) {
                      int need = target - nums[i];
                      auto it = seen.find(need);
                      if (it != seen.end()) return {it->second, i};
                      seen[nums[i]] = i;
                  }
                  return {};
              }
          };
        `,
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("2 7 11 15\n9", "0 1")],
      ...workspaceOptions(),
    });

    if (result.verdict !== "ACCEPTED") {
      result = await evaluateSubmission({
        submissionId: `test-${randomUUID()}`,
        problemSlug: "two-sum",
        language: "CPP",
        sourceCode: `
          #include <bits/stdc++.h>
          using namespace std;

          class Solution {
          public:
              vector<int> twoSum(vector<int>& nums, int target) {
                  unordered_map<int, int> seen;
                  for (int i = 0; i < static_cast<int>(nums.size()); i++) {
                      int need = target - nums[i];
                      auto it = seen.find(need);
                      if (it != seen.end()) return {it->second, i};
                      seen[nums[i]] = i;
                  }
                  return {};
              }
          };
        `,
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        testCases: [testCase("2 7 11 15\n9", "0 1")],
        ...workspaceOptions(),
      });
    }

    expect(result.verdict).toBe("ACCEPTED");
    expect(result.testResults[0]?.passed).toBe(true);
  }, 60_000);

  it("reports COMPILATION_ERROR for invalid C++ without running any tests", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "CPP",
      sourceCode: "int main() { this is not valid c++ +++ }",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("hello", "hello")],
      ...workspaceOptions(),
    });
    expect(result.verdict).toBe("COMPILATION_ERROR");
    expect(result.testResults).toHaveLength(0);
    expect(result.compilerOutput).toBeTruthy();
  }, 60_000);

  it("reports WRONG_ANSWER and stops after the first failing test", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "PYTHON",
      sourceCode: "print('nope')\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("hello", "hello"), testCase("world", "world")],
      ...workspaceOptions(),
    });
    expect(result.verdict).toBe("WRONG_ANSWER");
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0]?.passed).toBe(false);
  }, 60_000);

  it("reports RUNTIME_ERROR for a solution that exits non-zero", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "PYTHON",
      sourceCode: "raise Exception('boom')\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("hello", "hello")],
      ...workspaceOptions(),
    });
    expect(result.verdict).toBe("RUNTIME_ERROR");
    expect(result.testResults[0]?.passed).toBe(false);
  }, 60_000);

  it("reports TIME_LIMIT_EXCEEDED for a solution that never terminates", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "PYTHON",
      sourceCode: "while True:\n    pass\n",
      timeLimitMs: 300,
      memoryLimitMb: 256,
      testCases: [testCase("hello", "hello")],
      ...workspaceOptions(),
    });
    expect(result.verdict).toBe("TIME_LIMIT_EXCEEDED");
    expect(result.testResults[0]?.passed).toBe(false);
  }, 240_000);

  it("passes concurrent Python echo submissions", async () => {
    const sourceCode =
      "import sys\n" +
      "line = sys.stdin.readline()\n" +
      "if line.endswith('\\n'):\n" +
      "    line = line[:-1]\n" +
      "sys.stdout.write(line)\n";

    const submissions = await Promise.all(
      Array.from({ length: 4 }).map((_, i) =>
        evaluateSubmission({
          submissionId: `test-concurrent-${i}-${randomUUID()}`,
          language: "PYTHON",
          sourceCode,
          timeLimitMs: 5_000,
          memoryLimitMb: 256,
          testCases: [
            testCase(`alpha-${i}\n`, `alpha-${i}`),
            testCase(`beta-${i}\n`, `beta-${i}`),
            testCase(`gamma-${i}\n`, `gamma-${i}`),
          ],
          ...workspaceOptions(),
        }),
      ),
    );

    for (const result of submissions) {
      expect(result.verdict).toBe("ACCEPTED");
      expect(result.testResults).toHaveLength(3);
      expect(result.testResults.every((t) => t.passed)).toBe(true);
    }
  }, 240_000);
});
