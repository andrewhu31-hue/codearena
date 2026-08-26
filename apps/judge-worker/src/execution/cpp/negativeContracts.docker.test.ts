import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { evaluateSubmission } from "../evaluate.js";
import { isDockerAvailable } from "../dockerAvailable.js";

/**
 * Negative-path coverage for the C++ contract/harness system: every way a
 * submission or configuration can be wrong must fail clearly and safely —
 * never as a bare "undefined reference to main" linker error, and never by
 * silently compiling class-only code with no way to run it.
 */
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

function testCase(input: string, expectedOutput: string) {
  return { id: randomUUID(), input, expectedOutput };
}

describeIfDocker("C++ contract system — negative paths", () => {
  it("reports INTERNAL_ERROR before touching Docker for an unregistered class-only submission", async () => {
    const start = Date.now();
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "some-custom-problem-not-in-the-catalog",
      language: "CPP",
      sourceCode:
        "class Solution {\npublic:\n    int foo(vector<int>& nums) {\n        return 0;\n    }\n};\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("1 2 3", "0")],
    });
    const elapsedMs = Date.now() - start;

    expect(result.verdict).toBe("INTERNAL_ERROR");
    expect(result.testResults).toHaveLength(0);
    expect(result.compilerOutput).toBeTruthy();
    expect(result.compilerOutput).not.toContain("undefined reference to");
    // No Docker container was ever started for the compile/run step — this
    // should resolve near-instantly (well under a real compile+run cycle).
    expect(elapsedMs).toBeLessThan(2000);
  }, 10_000);

  it("reports INTERNAL_ERROR (not a linker error) for a class-only submission with no problemSlug at all", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      language: "CPP",
      sourceCode: "class Solution {\npublic:\n    int foo() { return 0; }\n};\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("1", "1")],
    });

    expect(result.verdict).toBe("INTERNAL_ERROR");
    expect(result.compilerOutput).not.toContain("undefined reference to");
  }, 10_000);

  it("still runs a standalone program (own main()) for a registered slug with a missing method", async () => {
    // Regression guard: even when the class the contestant writes doesn't
    // implement the expected method at all, a submission that supplies its
    // own main() must never be routed through the harness wrapper.
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "two-sum",
      language: "CPP",
      sourceCode:
        '#include <bits/stdc++.h>\nusing namespace std;\nint main() { cout << "0 1"; return 0; }\n',
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("2 7 11 15\n9", "0 1")],
    });

    expect(result.verdict).toBe("ACCEPTED");
  }, 30_000);

  it("reports COMPILATION_ERROR for a registered slug whose class omits the required method", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "two-sum",
      language: "CPP",
      sourceCode:
        "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int unrelated() { return 0; }\n};\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("2 7 11 15\n9", "0 1")],
    });

    expect(result.verdict).toBe("COMPILATION_ERROR");
    expect(result.testResults).toHaveLength(0);
  }, 30_000);

  it("reports COMPILATION_ERROR for a registered slug whose method has the wrong name", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "two-sum",
      language: "CPP",
      sourceCode:
        "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSumWrongName(vector<int>& nums, int target) {\n        return {0, 1};\n    }\n};\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("2 7 11 15\n9", "0 1")],
    });

    expect(result.verdict).toBe("COMPILATION_ERROR");
    expect(result.testResults).toHaveLength(0);
  }, 30_000);

  it("reports COMPILATION_ERROR for a registered slug whose method has the wrong return type", async () => {
    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "two-sum",
      language: "CPP",
      sourceCode:
        // twoSum must return vector<int>; returning a bare int cannot bind
        // to `vector<int> ans = solution.twoSum(...)` in the harness.
        "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int twoSum(vector<int>& nums, int target) {\n        return 0;\n    }\n};\n",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("2 7 11 15\n9", "0 1")],
    });

    expect(result.verdict).toBe("COMPILATION_ERROR");
    expect(result.testResults).toHaveLength(0);
  }, 30_000);

  it("proves Trie state persists across operations within one persistent Solution instance", async () => {
    const source =
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n" +
      "    void insert(string word) { words.insert(word); }\n" +
      "    bool search(string word) { return words.count(word) > 0; }\n" +
      "    bool startsWith(string prefix) { return false; }\n" +
      "private:\n    unordered_set<string> words;\n};\n";

    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "implement-trie-prefix-tree",
      language: "CPP",
      sourceCode: source,
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("insert apple\nsearch apple\nsearch banana", "true\nfalse")],
    });

    // This can only pass if "apple" inserted by the first operation is
    // still visible to the search two operations later — i.e. a single
    // persistent Solution instance across the whole sequence, not a fresh
    // instance per line.
    expect(result.verdict).toBe("ACCEPTED");
  }, 30_000);

  it("proves WordDictionary state persists across addWord/search calls", async () => {
    const source =
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n" +
      "    void addWord(string word) { words.push_back(word); }\n" +
      "    bool search(string word) {\n" +
      "        for (auto& w : words) if (w == word) return true;\n" +
      "        return false;\n" +
      "    }\n" +
      "private:\n    vector<string> words;\n};\n";

    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "add-and-search-word-data-structure-design",
      language: "CPP",
      sourceCode: source,
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("addWord bad\nsearch bad\nsearch dad", "true\nfalse")],
    });

    expect(result.verdict).toBe("ACCEPTED");
  }, 30_000);

  it("proves encode/decode codec state (if any) round-trips through one persistent instance", async () => {
    const source =
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n" +
      "    string encode(vector<string>& strs) {\n" +
      "        string res;\n" +
      '        for (auto& s : strs) res += to_string(s.size()) + "#" + s;\n' +
      "        callCount++;\n" +
      "        return res;\n" +
      "    }\n" +
      "    vector<string> decode(string s) {\n" +
      "        vector<string> res;\n" +
      "        size_t i = 0;\n" +
      "        while (i < s.size()) {\n" +
      "            size_t j = s.find('#', i);\n" +
      "            int len = stoi(s.substr(i, j - i));\n" +
      "            res.push_back(s.substr(j + 1, len));\n" +
      "            i = j + 1 + len;\n" +
      "        }\n" +
      "        return res;\n" +
      "    }\n" +
      "private:\n    int callCount = 0;\n};\n";

    const result = await evaluateSubmission({
      submissionId: `test-${randomUUID()}`,
      problemSlug: "encode-and-decode-strings",
      language: "CPP",
      sourceCode: source,
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      testCases: [testCase("hello|world", "hello|world")],
    });

    expect(result.verdict).toBe("ACCEPTED");
  }, 30_000);
});
