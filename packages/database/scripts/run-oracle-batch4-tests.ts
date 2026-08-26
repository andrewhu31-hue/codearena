import assert from "node:assert/strict";
import { CANONICAL_75_SLUGS } from "@codearena/shared";
import { BATCH1_SIMPLE_SLUGS } from "../src/problemOracles.js";
import { BATCH2_SLUGS } from "../src/problemOraclesBatch2.js";
import { BATCH3_SLUGS } from "../src/problemOraclesBatch3.js";
import {
  BATCH4_ADDITIONAL_INPUTS,
  BATCH4_BASELINE_UNIQUE_COUNT,
  BATCH4_SLUGS,
  computeBatch4ExpectedOutput,
} from "../src/problemOraclesBatch4.js";

const MIN_UNIQUE_PAIRS = 7;
const EXPECTED_SLUG_COUNT = 25;
const TOTAL_CATALOG_SIZE = 75;

// The canonical 75-slug manifest lives in packages/shared so both the
// oracle/seed validation here and the C++ contract registry validation
// compare against the exact same source of truth.
const ALL_75_SLUGS = CANONICAL_75_SLUGS;

const KNOWN_CASES: Array<{ slug: string; input: string; expectedOutput: string }> = [
  {
    slug: "add-and-search-word-data-structure-design",
    input: "addWord bad\naddWord dad\naddWord mad\nsearch pad\nsearch bad\nsearch .ad\nsearch b..",
    expectedOutput: "false\ntrue\ntrue\ntrue",
  },
  { slug: "alien-dictionary", input: "wrt wrf er ett rftt", expectedOutput: "wertf" },
  {
    slug: "binary-tree-level-order-traversal",
    input: "3 9 20 null null 15 7",
    expectedOutput: "3\n9 20\n15 7",
  },
  { slug: "binary-tree-maximum-path-sum", input: "1 2 3", expectedOutput: "6" },
  { slug: "clone-graph", input: "1: 2\n2: 1", expectedOutput: "1: 2\n2: 1" },
  { slug: "combination-sum", input: "2 3 6 7\n7", expectedOutput: "2 2 3\n7" },
  {
    slug: "construct-binary-tree-from-preorder-and-inorder-traversal",
    input: "3 9 20 15 7\n9 3 15 20 7",
    expectedOutput: "3 9 20 null null 15 7",
  },
  { slug: "counting-bits", input: "2", expectedOutput: "0 1 1" },
  { slug: "course-schedule", input: "2\n1\n1 0", expectedOutput: "true" },
  {
    slug: "encode-and-decode-strings",
    input: "lint|code|love|you",
    expectedOutput: "lint|code|love|you",
  },
  { slug: "fizz-buzz", input: "5", expectedOutput: "1\n2\nFizz\n4\nBuzz" },
  {
    slug: "graph-valid-tree",
    input: "5 4\n0 1\n0 2\n0 3\n1 4",
    expectedOutput: "true",
  },
  {
    slug: "implement-trie-prefix-tree",
    input: "insert apple\nsearch apple\nsearch app\nstartsWith app\ninsert app\nsearch app",
    expectedOutput: "true\nfalse\ntrue\ntrue",
  },
  { slug: "invert-binary-tree", input: "4 2 7 1 3 6 9", expectedOutput: "4 7 2 9 6 3 1" },
  { slug: "longest-common-subsequence", input: "abcde\nace", expectedOutput: "3" },
  {
    slug: "lowest-common-ancestor-of-a-binary-search-tree",
    input: "6 2 8 0 4 7 9 null null 3 5\n2 8",
    expectedOutput: "6",
  },
  {
    slug: "merge-k-sorted-lists",
    input: "1 4 5|1 3 4|2 6",
    expectedOutput: "1 1 2 3 4 4 5 6",
  },
  {
    slug: "minimum-window-substring",
    input: "ADOBECODEBANC\nABC",
    expectedOutput: "BANC",
  },
  {
    slug: "non-overlapping-intervals",
    input: "3\n1 2\n2 3\n3 4",
    expectedOutput: "0",
  },
  {
    slug: "number-of-connected-components-in-an-undirected-graph",
    input: "5 2\n0 1\n1 2",
    expectedOutput: "3",
  },
  {
    slug: "number-of-islands",
    input: "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0",
    expectedOutput: "1",
  },
  { slug: "pacific-atlantic-water-flow", input: "1 1\n5", expectedOutput: "0 0" },
  {
    slug: "rotate-image",
    input: "3\n1 2 3\n4 5 6\n7 8 9",
    expectedOutput: "7 4 1\n8 5 2\n9 6 3",
  },
  {
    slug: "serialize-and-deserialize-binary-tree",
    input: "1 2 3 null null 4 5",
    expectedOutput: "1 2 3 null null 4 5",
  },
  {
    slug: "set-matrix-zeroes",
    input: "3 3\n1 1 1\n1 0 1\n1 1 1",
    expectedOutput: "1 0 1\n0 0 0\n1 0 1",
  },
];

function main() {
  // Exactly 25 selected slugs.
  assert.equal(BATCH4_SLUGS.length, EXPECTED_SLUG_COUNT, "Batch 4 must select exactly 25 slugs");
  assert.equal(new Set(BATCH4_SLUGS).size, EXPECTED_SLUG_COUNT, "Batch 4 slugs must be unique");

  // No overlap with Batches 1-3.
  const priorSlugs = new Set<string>([...BATCH1_SIMPLE_SLUGS, ...BATCH2_SLUGS, ...BATCH3_SLUGS]);
  for (const slug of BATCH4_SLUGS) {
    assert.ok(!priorSlugs.has(slug), `${slug} overlaps a prior batch`);
  }

  // Union of all four batches equals exactly the 75 seeded problems.
  const unionAll = new Set<string>([...priorSlugs, ...BATCH4_SLUGS]);
  assert.equal(unionAll.size, TOTAL_CATALOG_SIZE, "union of all batches must total 75 slugs");
  const catalogSet = new Set<string>(ALL_75_SLUGS);
  assert.equal(catalogSet.size, TOTAL_CATALOG_SIZE, "reference catalog must list 75 unique slugs");
  for (const slug of unionAll) {
    assert.ok(catalogSet.has(slug), `${slug} is not part of the reference 75-slug catalog`);
  }
  for (const slug of catalogSet) {
    assert.ok(unionAll.has(slug), `${slug} in the reference catalog is not covered by any batch`);
  }

  // Every selected slug covered by exactly one known case, and every known
  // case belongs to a selected slug.
  const knownSlugs = new Set(KNOWN_CASES.map((c) => c.slug));
  for (const slug of BATCH4_SLUGS) {
    assert.ok(knownSlugs.has(slug), `${slug} is missing a hand-verified known case`);
  }
  for (const c of KNOWN_CASES) {
    assert.ok(
      (BATCH4_SLUGS as readonly string[]).includes(c.slug),
      `known case slug '${c.slug}' is not part of Batch 4`,
    );
  }

  // Every hand-verified known case matches the oracle.
  for (const c of KNOWN_CASES) {
    const actual = computeBatch4ExpectedOutput(c.slug, c.input);
    assert.equal(actual, c.expectedOutput, `oracle mismatch for known case: ${c.slug}`);
  }

  for (const slug of BATCH4_SLUGS) {
    // Every selected slug has a working oracle.
    assert.doesNotThrow(
      () => computeBatch4ExpectedOutput(slug, KNOWN_CASES.find((c) => c.slug === slug)!.input),
      `${slug} has no working oracle`,
    );

    const inputs = BATCH4_ADDITIONAL_INPUTS[slug];

    // No duplicate proposed inputs for a slug.
    const inputSet = new Set(inputs);
    assert.equal(inputSet.size, inputs.length, `${slug} has duplicate proposed inputs`);

    // Enough proposed additions (on top of the measured baseline) to reach
    // the unique-pair floor. Slugs already at/above the floor may add zero.
    const baseline = BATCH4_BASELINE_UNIQUE_COUNT[slug];
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
      const a = computeBatch4ExpectedOutput(slug, input);
      // Repeated oracle calls return identical output.
      const b = computeBatch4ExpectedOutput(slug, input);
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
    { slug: "binary-tree-maximum-path-sum", input: "" },
    {
      slug: "construct-binary-tree-from-preorder-and-inorder-traversal",
      input: "1 2 3\n1 2",
    },
    { slug: "counting-bits", input: "-1" },
    { slug: "course-schedule", input: "-1\n0" },
    { slug: "fizz-buzz", input: "0" },
    { slug: "graph-valid-tree", input: "-1 0" },
    { slug: "lowest-common-ancestor-of-a-binary-search-tree", input: "\n1 2" },
    { slug: "rotate-image", input: "0" },
  ];
  for (const { slug, input } of rejectionCases) {
    assert.throws(
      () => computeBatch4ExpectedOutput(slug, input),
      `${slug} should reject malformed input '${input}'`,
    );
  }

  console.log("oracle-batch4-tests: PASS");
}

main();
