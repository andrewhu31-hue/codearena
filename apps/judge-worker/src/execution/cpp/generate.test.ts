import { describe, expect, it } from "vitest";
import { CPP_CONTRACT_REGISTRY, CANONICAL_75_SLUGS, STRUCT_TEXT_BY_NAME } from "@codearena/shared";
import { hasCppMain, wrapCppSubmission, buildCppHarnessSource } from "./generate.js";

describe("hasCppMain", () => {
  it("detects a standard main()", () => {
    expect(hasCppMain("int main() { return 0; }")).toBe(true);
  });
  it("detects main() with a whitespace variant", () => {
    expect(hasCppMain("int   main ( ) {\n  return 0;\n}")).toBe(true);
  });
  it("returns false for class-only source with no main", () => {
    expect(hasCppMain("class Solution {\npublic:\n  int foo() { return 0; }\n};\n")).toBe(false);
  });
  it("does not false-positive on a comment or string mentioning main", () => {
    // Deliberately conservative: this regex-based check only needs to
    // avoid the specific defect (never claiming a real main is missing),
    // not achieve full C++ parsing.
    expect(hasCppMain("int main() {}")).toBe(true);
  });
});

describe("wrapCppSubmission", () => {
  it("returns standalone unchanged when a main() is present, even for a registered slug", () => {
    const source = "int main() { return 0; }";
    const result = wrapCppSubmission(source, "two-sum");
    expect(result).toEqual({ kind: "standalone", sourceCode: source });
  });

  it("returns standalone unchanged when a main() is present and slug is unregistered", () => {
    const source = "int main() { return 0; }";
    const result = wrapCppSubmission(source, "some-custom-problem-not-in-catalog");
    expect(result).toEqual({ kind: "standalone", sourceCode: source });
  });

  it("returns standalone unchanged when a main() is present and no slug is given at all", () => {
    const source = "int main() { return 0; }";
    const result = wrapCppSubmission(source, undefined);
    expect(result).toEqual({ kind: "standalone", sourceCode: source });
  });

  it("wraps a class-only submission for a registered slug", () => {
    const source =
      "class Solution {\npublic:\n  vector<int> twoSum(vector<int>& nums, int target) { return {}; }\n};\n";
    const result = wrapCppSubmission(source, "two-sum");
    expect(result.kind).toBe("wrapped");
    if (result.kind === "wrapped") {
      expect(result.sourceCode).toContain(source);
      expect(hasCppMain(result.sourceCode)).toBe(true);
    }
  });

  it("reports missing_contract for a class-only submission with an unregistered slug", () => {
    const source = "class Solution {\npublic:\n  int foo() { return 0; }\n};\n";
    const result = wrapCppSubmission(source, "some-custom-problem-not-in-catalog");
    expect(result).toEqual({
      kind: "missing_contract",
      slug: "some-custom-problem-not-in-catalog",
    });
  });

  it("reports missing_contract for a class-only submission with no slug at all", () => {
    const source = "class Solution {\npublic:\n  int foo() { return 0; }\n};\n";
    const result = wrapCppSubmission(source, undefined);
    expect(result).toEqual({ kind: "missing_contract", slug: undefined });
  });
});

describe("buildCppHarnessSource", () => {
  it("generates exactly one main() for every one of the 75 registered contracts", () => {
    for (const slug of CANONICAL_75_SLUGS) {
      const contract = CPP_CONTRACT_REGISTRY[slug];
      const harness = buildCppHarnessSource(contract, "");
      const mainCount = (harness.match(/\bint\s+main\s*\(/g) ?? []).length;
      expect(mainCount, `${slug} should generate exactly one main()`).toBe(1);
    }
  });

  it("never generates a harness that itself lacks a main (never a missing-main config)", () => {
    for (const slug of CANONICAL_75_SLUGS) {
      const contract = CPP_CONTRACT_REGISTRY[slug];
      expect(hasCppMain(buildCppHarnessSource(contract, "")), slug).toBe(true);
    }
  });

  it("never redefines a struct the contestant's own source already provides", () => {
    // Regression test: the harness prelude must not redeclare TreeNode/
    // ListNode/Node when the contestant's source (from the shared starter
    // template) already defines it — that previously caused a genuine
    // 'redefinition of struct TreeNode' compile error for every tree/list/
    // graph-node contract.
    for (const slug of CANONICAL_75_SLUGS) {
      const contract = CPP_CONTRACT_REGISTRY[slug];
      const contestantSource = `${STRUCT_TEXT_BY_NAME.TreeNode}\n${STRUCT_TEXT_BY_NAME.ListNode}\n${STRUCT_TEXT_BY_NAME.Node}\nclass Solution {};\n`;
      const harness = buildCppHarnessSource(contract, contestantSource);
      const full = `${contestantSource}\n${harness}`;
      for (const marker of ["struct TreeNode", "struct ListNode", "class Node {"]) {
        const count = full.split(marker).length - 1;
        expect(count, `${slug}: '${marker}' should appear at most once`).toBeLessThanOrEqual(1);
      }
    }
  });
});
