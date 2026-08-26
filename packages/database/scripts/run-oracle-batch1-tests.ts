import assert from "node:assert/strict";
import {
  BATCH1_ADDITIONAL_INPUTS,
  BATCH1_SIMPLE_SLUGS,
  computeExpectedOutputForSupportedProblem,
} from "../src/problemOracles.js";

const KNOWN_CASES: Array<{ slug: string; input: string; expectedOutput: string }> = [
  {
    slug: "group-anagrams",
    input: "eat tea tan ate nat bat",
    expectedOutput: "ate eat tea\nbat\nnat tan",
  },
  { slug: "palindromic-substrings", input: "aaa", expectedOutput: "6" },
  { slug: "word-break", input: "leetcode\nleet code", expectedOutput: "true" },
  {
    slug: "word-search",
    input: "3 4\nA B C E\nS F C S\nA D E E\nABCCED",
    expectedOutput: "true",
  },
  { slug: "maximum-depth-of-binary-tree", input: "3 9 20 null null 15 7", expectedOutput: "3" },
  { slug: "same-tree", input: "1 2 3\n1 2 3", expectedOutput: "true" },
  { slug: "validate-binary-search-tree", input: "2 1 3", expectedOutput: "true" },
  { slug: "kth-smallest-element-in-a-bst", input: "3 1 4 null 2\n1", expectedOutput: "1" },
  { slug: "merge-two-sorted-lists", input: "1 2 4\n1 3 4", expectedOutput: "1 1 2 3 4 4" },
  { slug: "subtree-of-another-tree", input: "3 4 5 1 2\n4 1 2", expectedOutput: "true" },
];

function main() {
  for (const c of KNOWN_CASES) {
    const actual = computeExpectedOutputForSupportedProblem(c.slug, c.input);
    assert.equal(actual, c.expectedOutput, `oracle mismatch for known case: ${c.slug}`);
  }

  for (const slug of BATCH1_SIMPLE_SLUGS) {
    const inputs = BATCH1_ADDITIONAL_INPUTS[slug];
    assert.ok(inputs.length >= 5, `${slug} should have at least 5 additional inputs`);

    for (const input of inputs) {
      const a = computeExpectedOutputForSupportedProblem(slug, input);
      const b = computeExpectedOutputForSupportedProblem(slug, input);
      assert.equal(a, b, `oracle for ${slug} must be deterministic`);
      assert.ok(typeof a === "string", `oracle output for ${slug} must be a string`);
    }
  }

  console.log("oracle-batch1-tests: PASS");
}

main();
