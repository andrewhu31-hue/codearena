import assert from "node:assert/strict";
import { BATCH1_SIMPLE_SLUGS } from "../src/problemOracles.js";
import { BATCH2_SLUGS } from "../src/problemOraclesBatch2.js";
import {
  BATCH3_ADDITIONAL_INPUTS,
  BATCH3_BASELINE_UNIQUE_COUNT,
  BATCH3_SLUGS,
  computeBatch3ExpectedOutput,
} from "../src/problemOraclesBatch3.js";

const MIN_UNIQUE_PAIRS = 7;
const EXPECTED_SLUG_COUNT = 20;

const KNOWN_CASES: Array<{ slug: string; input: string; expectedOutput: string }> = [
  { slug: "climbing-stairs", input: "3", expectedOutput: "3" },
  { slug: "house-robber", input: "1 2 3 1", expectedOutput: "4" },
  { slug: "house-robber-ii", input: "2 3 2", expectedOutput: "3" },
  { slug: "jump-game", input: "2 3 1 1 4", expectedOutput: "true" },
  {
    slug: "longest-consecutive-sequence",
    input: "100 4 200 1 3 2",
    expectedOutput: "4",
  },
  {
    slug: "longest-increasing-subsequence",
    input: "10 9 2 5 3 7 101 18",
    expectedOutput: "4",
  },
  { slug: "maximum-product-subarray", input: "2 3 -2 4", expectedOutput: "6" },
  { slug: "unique-paths", input: "3 7", expectedOutput: "28" },
  { slug: "coin-change", input: "1 2 5\n11", expectedOutput: "3" },
  { slug: "decode-ways", input: "12", expectedOutput: "2" },
  { slug: "binary-search", input: "-1 0 3 5 9 12\n9", expectedOutput: "4" },
  {
    slug: "find-minimum-in-rotated-sorted-array",
    input: "3 4 5 1 2",
    expectedOutput: "1",
  },
  {
    slug: "search-in-rotated-sorted-array",
    input: "4 5 6 7 0 1 2\n0",
    expectedOutput: "4",
  },
  { slug: "number-of-1-bits", input: "11", expectedOutput: "3" },
  { slug: "reverse-bits", input: "43261596", expectedOutput: "964176192" },
  { slug: "sum-of-two-integers", input: "1 2", expectedOutput: "3" },
  { slug: "reverse-string", input: "hello", expectedOutput: "olleh" },
  { slug: "meeting-rooms", input: "2\n0 30\n5 10", expectedOutput: "false" },
  {
    slug: "meeting-rooms-ii",
    input: "3\n0 30\n5 10\n15 20",
    expectedOutput: "2",
  },
  {
    slug: "spiral-matrix",
    input: "3 3\n1 2 3\n4 5 6\n7 8 9",
    expectedOutput: "1 2 3 6 9 8 7 4 5",
  },
];

function main() {
  // Exactly 20 selected slugs.
  assert.equal(BATCH3_SLUGS.length, EXPECTED_SLUG_COUNT, "Batch 3 must select exactly 20 slugs");
  assert.equal(new Set(BATCH3_SLUGS).size, EXPECTED_SLUG_COUNT, "Batch 3 slugs must be unique");

  // No overlap with Batch 1 or Batch 2.
  const priorSlugs = new Set<string>([...BATCH1_SIMPLE_SLUGS, ...BATCH2_SLUGS]);
  for (const slug of BATCH3_SLUGS) {
    assert.ok(!priorSlugs.has(slug), `${slug} overlaps a prior batch`);
  }

  // Every selected slug covered by exactly one known case, and every known
  // case belongs to a selected slug.
  const knownSlugs = new Set(KNOWN_CASES.map((c) => c.slug));
  for (const slug of BATCH3_SLUGS) {
    assert.ok(knownSlugs.has(slug), `${slug} is missing a hand-verified known case`);
  }
  for (const c of KNOWN_CASES) {
    assert.ok(
      (BATCH3_SLUGS as readonly string[]).includes(c.slug),
      `known case slug '${c.slug}' is not part of Batch 3`,
    );
  }

  // Every hand-verified known case matches the oracle.
  for (const c of KNOWN_CASES) {
    const actual = computeBatch3ExpectedOutput(c.slug, c.input);
    assert.equal(actual, c.expectedOutput, `oracle mismatch for known case: ${c.slug}`);
  }

  for (const slug of BATCH3_SLUGS) {
    // Every selected slug has a working oracle.
    assert.doesNotThrow(
      () => computeBatch3ExpectedOutput(slug, KNOWN_CASES.find((c) => c.slug === slug)!.input),
      `${slug} has no working oracle`,
    );

    const inputs = BATCH3_ADDITIONAL_INPUTS[slug];

    // No duplicate proposed inputs for a slug.
    const inputSet = new Set(inputs);
    assert.equal(inputSet.size, inputs.length, `${slug} has duplicate proposed inputs`);

    // Enough proposed additions (on top of the measured baseline) to reach
    // the unique-pair floor. Slugs already at/above the floor may add zero.
    const baseline = BATCH3_BASELINE_UNIQUE_COUNT[slug];
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
      const a = computeBatch3ExpectedOutput(slug, input);
      // Repeated oracle calls return identical output.
      const b = computeBatch3ExpectedOutput(slug, input);
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
    { slug: "climbing-stairs", input: "0" },
    { slug: "house-robber", input: "" },
    { slug: "house-robber-ii", input: "" },
    { slug: "jump-game", input: "" },
    { slug: "maximum-product-subarray", input: "" },
    { slug: "unique-paths", input: "0 5" },
    { slug: "find-minimum-in-rotated-sorted-array", input: "" },
    { slug: "number-of-1-bits", input: "-1" },
    { slug: "number-of-1-bits", input: "4294967296" },
    { slug: "reverse-bits", input: "-1" },
    { slug: "sum-of-two-integers", input: "1" },
    { slug: "meeting-rooms", input: "-1" },
    { slug: "meeting-rooms-ii", input: "-1" },
    { slug: "spiral-matrix", input: "0 3\n1 2 3" },
  ];
  for (const { slug, input } of rejectionCases) {
    assert.throws(
      () => computeBatch3ExpectedOutput(slug, input),
      `${slug} should reject malformed input '${input}'`,
    );
  }

  console.log("oracle-batch3-tests: PASS");
}

main();
