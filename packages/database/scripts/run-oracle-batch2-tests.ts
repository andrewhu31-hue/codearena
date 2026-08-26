import assert from "node:assert/strict";
import {
  BATCH2_ADDITIONAL_INPUTS,
  BATCH2_BASELINE_UNIQUE_COUNT,
  BATCH2_SLUGS,
  computeBatch2ExpectedOutput,
} from "../src/problemOraclesBatch2.js";

const MIN_UNIQUE_PAIRS = 7;

const KNOWN_CASES: Array<{ slug: string; input: string; expectedOutput: string }> = [
  { slug: "two-sum", input: "2 7 11 15\n9", expectedOutput: "0 1" },
  { slug: "contains-duplicate", input: "1 2 3 1", expectedOutput: "true" },
  {
    slug: "maximum-subarray",
    input: "-2 1 -3 4 -1 2 1 -5 4",
    expectedOutput: "6",
  },
  {
    slug: "product-of-array-except-self",
    input: "1 2 3 4",
    expectedOutput: "24 12 8 6",
  },
  { slug: "best-time-to-buy-and-sell-stock", input: "7 1 5 3 6 4", expectedOutput: "5" },
  {
    slug: "container-with-most-water",
    input: "1 8 6 2 5 4 8 3 7",
    expectedOutput: "49",
  },
  {
    slug: "three-sum",
    input: "-1 0 1 2 -1 -4",
    expectedOutput: "-1 -1 2\n-1 0 1",
  },
  { slug: "missing-number", input: "3 0 1", expectedOutput: "2" },
  { slug: "valid-anagram", input: "anagram\nnagaram", expectedOutput: "true" },
  {
    slug: "valid-palindrome",
    input: "A man, a plan, a canal: Panama",
    expectedOutput: "true",
  },
  { slug: "valid-parentheses", input: "()[]{}", expectedOutput: "true" },
  { slug: "longest-substring", input: "abcabcbb", expectedOutput: "3" },
  {
    slug: "longest-repeating-character-replacement",
    input: "AABABBA\n1",
    expectedOutput: "4",
  },
  { slug: "reverse-linked-list", input: "1 2 3 4 5", expectedOutput: "5 4 3 2 1" },
  { slug: "linked-list-cycle", input: "3 2 0 -4\n1", expectedOutput: "true" },
  {
    slug: "remove-nth-node-from-end-of-list",
    input: "1 2 3 4 5\n2",
    expectedOutput: "1 2 3 5",
  },
  { slug: "reorder-list", input: "1 2 3 4", expectedOutput: "1 4 2 3" },
  {
    slug: "merge-intervals",
    input: "1 3\n2 6\n8 10\n15 18",
    expectedOutput: "1 6\n8 10\n15 18",
  },
  {
    slug: "insert-interval",
    input: "2\n1 3\n6 9\n2 5",
    expectedOutput: "1 5\n6 9",
  },
  {
    slug: "top-k-frequent-elements",
    input: "1 1 1 2 2 3\n2",
    expectedOutput: "1 2",
  },
];

function main() {
  // Every selected slug covered by exactly one known case, and every known
  // case belongs to a selected slug.
  const knownSlugs = new Set(KNOWN_CASES.map((c) => c.slug));
  for (const slug of BATCH2_SLUGS) {
    assert.ok(knownSlugs.has(slug), `${slug} is missing a hand-verified known case`);
  }
  for (const c of KNOWN_CASES) {
    assert.ok(
      (BATCH2_SLUGS as readonly string[]).includes(c.slug),
      `known case slug '${c.slug}' is not part of Batch 2`,
    );
  }

  // Every hand-verified known case matches the oracle.
  for (const c of KNOWN_CASES) {
    const actual = computeBatch2ExpectedOutput(c.slug, c.input);
    assert.equal(actual, c.expectedOutput, `oracle mismatch for known case: ${c.slug}`);
  }

  for (const slug of BATCH2_SLUGS) {
    // Every selected slug has an oracle registered.
    assert.doesNotThrow(
      () => computeBatch2ExpectedOutput(slug, KNOWN_CASES.find((c) => c.slug === slug)!.input),
      `${slug} has no working oracle`,
    );

    const inputs = BATCH2_ADDITIONAL_INPUTS[slug];

    // No duplicate proposed inputs for a slug.
    const inputSet = new Set(inputs);
    assert.equal(inputSet.size, inputs.length, `${slug} has duplicate proposed inputs`);

    // Enough proposed additions (on top of the measured baseline) to reach
    // the unique-pair floor. Slugs already at/above the floor may add zero.
    const baseline = BATCH2_BASELINE_UNIQUE_COUNT[slug];
    assert.ok(
      baseline + inputs.length >= MIN_UNIQUE_PAIRS,
      `${slug} baseline (${baseline}) + additions (${inputs.length}) does not reach ${MIN_UNIQUE_PAIRS}`,
    );

    // No conflicting expected outputs for the same input across this slug's
    // known case + proposed additions.
    const outputByInput = new Map<string, string>();
    const known = KNOWN_CASES.find((c) => c.slug === slug);
    if (known) outputByInput.set(known.input, known.expectedOutput);

    for (const input of inputs) {
      const a = computeBatch2ExpectedOutput(slug, input);
      // Repeated oracle calls return identical output.
      const b = computeBatch2ExpectedOutput(slug, input);
      assert.equal(a, b, `oracle for ${slug} must be deterministic`);
      assert.ok(typeof a === "string", `oracle output for ${slug} must be a string`);

      const existing = outputByInput.get(input);
      if (existing !== undefined) {
        assert.equal(
          existing,
          a,
          `${slug} has conflicting expected outputs for the same input: '${input}'`,
        );
      }
      outputByInput.set(input, a);
    }
  }

  // Malformed/invalid inputs must be explicitly rejected, not silently
  // accepted with a made-up answer.
  const rejectionCases: Array<{ slug: string; input: string }> = [
    { slug: "remove-nth-node-from-end-of-list", input: "1 2 3\n4" },
    { slug: "remove-nth-node-from-end-of-list", input: "1 2 3\n0" },
    { slug: "linked-list-cycle", input: "1 2\n5" },
    { slug: "top-k-frequent-elements", input: "1 2 3\n0" },
    { slug: "top-k-frequent-elements", input: "1 2 3\n4" },
    { slug: "insert-interval", input: "-1\n1 2" },
    { slug: "maximum-subarray", input: "" },
  ];
  for (const { slug, input } of rejectionCases) {
    assert.throws(
      () => computeBatch2ExpectedOutput(slug, input),
      `${slug} should reject malformed input '${input}'`,
    );
  }

  console.log("oracle-batch2-tests: PASS");
}

main();
