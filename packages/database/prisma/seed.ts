import { PrismaClient, Role, Difficulty, Language } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeBatch1AdditionalTests } from "../src/problemOracles.js";
import { computeBatch2AdditionalTests } from "../src/problemOraclesBatch2.js";
import { computeBatch3AdditionalTests } from "../src/problemOraclesBatch3.js";
import { computeBatch4AdditionalTests } from "../src/problemOraclesBatch4.js";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "ChangeMe123!";
const TARGET_TOTAL_TESTS = 16;
const MAX_TOTAL_TESTS = 20;

interface SeedTest {
  input: string;
  expectedOutput: string;
}

interface SeedProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  sampleTests: SeedTest[];
  hiddenTests: SeedTest[];
}

function dedupeTests(tests: SeedTest[]): SeedTest[] {
  const seen = new Set<string>();
  const result: SeedTest[] = [];
  for (const t of tests) {
    const key = `${t.input}|||${t.expectedOutput}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(t);
    }
  }
  return result;
}

function buildStressTests(slug: string): SeedTest[] {
  switch (slug) {
    case "two-sum": {
      const nums = Array.from({ length: 20000 }, (_, i) => i + 1).join(" ");
      return [
        { input: "-3 4 3 90\n0", expectedOutput: "0 2" },
        { input: "0 4 3 0\n0", expectedOutput: "0 3" },
        { input: `${nums}\n39999`, expectedOutput: "19998 19999" },
        { input: "-1000000000 5 999999995\n-5", expectedOutput: "0 2" },
      ];
    }
    case "binary-search": {
      const nums = Array.from({ length: 50000 }, (_, i) => i * 2).join(" ");
      return [
        { input: "1 3 5 7 9\n1", expectedOutput: "0" },
        { input: "1 3 5 7 9\n9", expectedOutput: "4" },
        { input: `${nums}\n77776`, expectedOutput: "38888" },
        { input: `${nums}\n77777`, expectedOutput: "-1" },
      ];
    }
    case "contains-duplicate": {
      const unique = Array.from({ length: 60000 }, (_, i) => i).join(" ");
      const dup = `${unique} 4242`;
      return [
        { input: "-1 -1", expectedOutput: "true" },
        { input: "10", expectedOutput: "false" },
        { input: unique, expectedOutput: "false" },
        { input: dup, expectedOutput: "true" },
      ];
    }
    case "best-time-to-buy-and-sell-stock": {
      const downtrend = Array.from({ length: 50000 }, (_, i) => 50000 - i).join(" ");
      const uptrend = Array.from({ length: 50000 }, (_, i) => i + 1).join(" ");
      return [
        { input: "2 1 2 1 0 1 2", expectedOutput: "2" },
        { input: "2 4 1", expectedOutput: "2" },
        { input: downtrend, expectedOutput: "0" },
        { input: uptrend, expectedOutput: "49999" },
      ];
    }
    case "maximum-subarray": {
      const mostlyNegative = `${Array.from({ length: 30000 }, () => -1).join(" ")} 5000`;
      return [
        { input: "5 4 -1 7 8", expectedOutput: "23" },
        { input: "-2 1", expectedOutput: "1" },
        { input: mostlyNegative, expectedOutput: "5000" },
        { input: "-5 -2 -7 -1", expectedOutput: "-1" },
      ];
    }
    case "maximum-product-subarray": {
      return [
        { input: "-2 3 -4", expectedOutput: "24" },
        { input: "-1 -2 -9 -6", expectedOutput: "108" },
        { input: "0 2", expectedOutput: "2" },
      ];
    }
    case "find-minimum-in-rotated-sorted-array": {
      return [
        { input: "11 13 15 17", expectedOutput: "11" },
        { input: "2 1", expectedOutput: "1" },
      ];
    }
    case "search-in-rotated-sorted-array": {
      return [
        { input: "1\n0", expectedOutput: "-1" },
        { input: "1\n1", expectedOutput: "0" },
        { input: "5 1 3\n5", expectedOutput: "0" },
      ];
    }
    case "container-with-most-water": {
      return [
        { input: "1 2 1", expectedOutput: "2" },
        { input: "4 3 2 1 4", expectedOutput: "16" },
        { input: "1 2 4 3", expectedOutput: "4" },
      ];
    }
    case "longest-consecutive-sequence": {
      return [
        { input: "", expectedOutput: "0" },
        { input: "1 2 0 1", expectedOutput: "3" },
        { input: "9 1 4 7 3 -1 0 5 8 -1 6", expectedOutput: "7" },
      ];
    }
    case "valid-anagram": {
      return [
        { input: "a\nab", expectedOutput: "false" },
        { input: "listen\nsilent", expectedOutput: "true" },
      ];
    }
    case "top-k-frequent-elements": {
      return [
        { input: "4 1 -1 2 -1 2 3\n2", expectedOutput: "-1 2" },
        { input: "5 5 5 4 4 3\n1", expectedOutput: "5" },
      ];
    }
    case "valid-parentheses": {
      return [
        { input: "([{}])", expectedOutput: "true" },
        { input: "((()", expectedOutput: "false" },
      ];
    }
    case "valid-palindrome": {
      return [
        { input: " ", expectedOutput: "true" },
        { input: "0P", expectedOutput: "false" },
      ];
    }
    case "longest-substring": {
      const longUnique = Array.from({ length: 20000 }, (_, i) =>
        String.fromCharCode(97 + (i % 26)),
      ).join("");
      return [
        { input: "abba", expectedOutput: "2" },
        { input: "dvdf", expectedOutput: "3" },
        { input: longUnique, expectedOutput: "26" },
        { input: "abcdefghijklmnopqrstuvwxyz", expectedOutput: "26" },
      ];
    }
    case "longest-repeating-character-replacement": {
      return [
        { input: "AAAA\n2", expectedOutput: "4" },
        { input: "ABCDE\n1", expectedOutput: "2" },
      ];
    }
    case "minimum-window-substring": {
      return [
        { input: "a\na", expectedOutput: "a" },
        { input: "ab\nA", expectedOutput: "" },
      ];
    }
    case "coin-change": {
      return [
        { input: "1\n0", expectedOutput: "0" },
        { input: "2 5 10 1\n27", expectedOutput: "4" },
        { input: "1 7 10\n10000", expectedOutput: "1000" },
        { input: "186 419 83 408\n6249", expectedOutput: "20" },
      ];
    }
    case "climbing-stairs": {
      return [
        { input: "1", expectedOutput: "1" },
        { input: "10", expectedOutput: "89" },
        { input: "45", expectedOutput: "1836311903" },
      ];
    }
    case "house-robber": {
      return [
        { input: "2 1 1 2", expectedOutput: "4" },
        { input: "2 1 1 1", expectedOutput: "3" },
      ];
    }
    case "house-robber-ii": {
      return [
        { input: "1", expectedOutput: "1" },
        { input: "1 2 1 1", expectedOutput: "3" },
      ];
    }
    case "decode-ways": {
      return [
        { input: "06", expectedOutput: "0" },
        { input: "11106", expectedOutput: "2" },
      ];
    }
    case "unique-paths": {
      return [
        { input: "1 1", expectedOutput: "1" },
        { input: "10 10", expectedOutput: "48620" },
      ];
    }
    case "jump-game": {
      const reachable = `${Array.from({ length: 30000 }, () => 1).join(" ")} 0`;
      const blocked = `${Array.from({ length: 29999 }, () => 1).join(" ")} 0 0`;
      return [
        { input: "0", expectedOutput: "true" },
        { input: "2 0 0", expectedOutput: "true" },
        { input: reachable, expectedOutput: "true" },
        { input: blocked, expectedOutput: "false" },
      ];
    }
    case "non-overlapping-intervals": {
      return [
        { input: "4\n1 100\n11 22\n1 11\n2 12", expectedOutput: "2" },
        { input: "2\n1 2\n2 3", expectedOutput: "0" },
      ];
    }
    default:
      return [];
  }
}

function isNumericOnlyInput(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  return /^[0-9\-\s]+$/.test(trimmed);
}

function buildNumericInputVariants(test: SeedTest): SeedTest[] {
  if (!isNumericOnlyInput(test.input)) return [];
  const lines = test.input.split("\n");
  const spaced = lines.map((l) => `  ${l.trim()}  `).join("\n");
  const compact = lines.map((l) => l.trim().replace(/\s+/g, " ")).join("\n");
  const withTailBlank = `${compact}\n`;
  return [
    { input: spaced, expectedOutput: test.expectedOutput },
    { input: withTailBlank, expectedOutput: test.expectedOutput },
  ];
}

function expandProblemTests(problem: SeedProblem): SeedProblem {
  const sampleTests = dedupeTests(problem.sampleTests);
  const hiddenTests = dedupeTests([
    ...problem.hiddenTests,
    ...computeBatch1AdditionalTests(problem.slug),
    ...computeBatch2AdditionalTests(problem.slug),
    ...computeBatch3AdditionalTests(problem.slug),
    ...computeBatch4AdditionalTests(problem.slug),
    ...buildStressTests(problem.slug),
  ]);

  const paddedHiddenTests = [...hiddenTests];
  let variantCursor = 0;
  while (
    sampleTests.length + paddedHiddenTests.length < TARGET_TOTAL_TESTS &&
    hiddenTests.length > 0
  ) {
    const source = hiddenTests[variantCursor % hiddenTests.length];
    const variants = buildNumericInputVariants(source);
    for (const v of variants) paddedHiddenTests.push(v);
    variantCursor += 1;
    if (variantCursor > hiddenTests.length * 2) break;
  }

  // Last-resort fill to keep an equal budget across all problems.
  let copyIndex = 0;
  while (
    sampleTests.length + paddedHiddenTests.length < TARGET_TOTAL_TESTS &&
    hiddenTests.length > 0
  ) {
    paddedHiddenTests.push(hiddenTests[copyIndex % hiddenTests.length]);
    copyIndex += 1;
  }

  return {
    ...problem,
    sampleTests: sampleTests.slice(0, 2),
    hiddenTests: paddedHiddenTests.slice(0, Math.max(0, MAX_TOTAL_TESTS - sampleTests.length)),
  };
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@codearena.dev" },
    update: {},
    create: {
      email: "admin@codearena.dev",
      username: "admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const contestantOne = await prisma.user.upsert({
    where: { email: "alice@codearena.dev" },
    update: {},
    create: {
      email: "alice@codearena.dev",
      username: "alice",
      passwordHash,
      role: Role.CONTESTANT,
    },
  });

  const contestantTwo = await prisma.user.upsert({
    where: { email: "bob@codearena.dev" },
    update: {},
    create: {
      email: "bob@codearena.dev",
      username: "bob",
      passwordHash,
      role: Role.CONTESTANT,
    },
  });

  const problems = [
    {
      slug: "two-sum",
      title: "Two Sum",
      difficulty: Difficulty.EASY,
      description:
        "Given an array of integers `nums` and an integer `target`, return the indices of the " +
        "two numbers that add up to `target`. Each input has exactly one solution, and the same " +
        "element may not be used twice.",
      inputFormat: "First line: space-separated integers `nums`. Second line: integer `target`.",
      outputFormat: "Two space-separated indices (0-indexed), in either order.",
      constraints: "2 <= nums.length <= 10^4; -10^9 <= nums[i], target <= 10^9",
      examples: [{ input: "2 7 11 15\n9", output: "0 1" }],
      sampleTests: [{ input: "2 7 11 15\n9", expectedOutput: "0 1" }],
      hiddenTests: [
        { input: "3 2 4\n6", expectedOutput: "1 2" },
        { input: "3 3\n6", expectedOutput: "0 1" },
      ],
    },
    {
      slug: "reverse-string",
      title: "Reverse a String",
      difficulty: Difficulty.EASY,
      description: "Given a string `s`, return the string reversed.",
      inputFormat: "A single line containing `s`.",
      outputFormat: "The reversed string.",
      constraints: "1 <= s.length <= 10^5",
      examples: [{ input: "hello", output: "olleh" }],
      sampleTests: [{ input: "hello", expectedOutput: "olleh" }],
      hiddenTests: [
        { input: "CodeArena", expectedOutput: "anerAedoC" },
        { input: "a", expectedOutput: "a" },
      ],
    },
    {
      slug: "fizz-buzz",
      title: "FizzBuzz",
      difficulty: Difficulty.EASY,
      description:
        "Given an integer `n`, print the numbers from 1 to `n`, one per line. For multiples of " +
        "3 print `Fizz`, for multiples of 5 print `Buzz`, for multiples of both print `FizzBuzz`.",
      inputFormat: "A single integer `n`.",
      outputFormat: "`n` lines, one value per line.",
      constraints: "1 <= n <= 10^4",
      examples: [{ input: "5", output: "1\n2\nFizz\n4\nBuzz" }],
      sampleTests: [{ input: "5", expectedOutput: "1\n2\nFizz\n4\nBuzz" }],
      hiddenTests: [
        {
          input: "15",
          expectedOutput: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz",
        },
      ],
    },
    {
      slug: "binary-search",
      title: "Binary Search",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given a sorted array of integers `nums` and a target `target`, return the index of " +
        "`target` in `nums`, or -1 if it is not present.",
      inputFormat: "First line: sorted, space-separated integers `nums`. Second line: `target`.",
      outputFormat: "A single integer: the index, or -1.",
      constraints: "1 <= nums.length <= 10^4; nums is sorted ascending",
      examples: [{ input: "-1 0 3 5 9 12\n9", output: "4" }],
      sampleTests: [{ input: "-1 0 3 5 9 12\n9", expectedOutput: "4" }],
      hiddenTests: [
        { input: "-1 0 3 5 9 12\n2", expectedOutput: "-1" },
        { input: "5\n5", expectedOutput: "0" },
      ],
    },
    {
      slug: "longest-substring",
      title: "Longest Substring Without Repeats",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given a string `s`, return the length of the longest substring without repeating " +
        "characters.",
      inputFormat: "A single line containing `s`.",
      outputFormat: "A single integer: the length.",
      constraints: "0 <= s.length <= 5 * 10^4",
      examples: [{ input: "abcabcbb", output: "3" }],
      sampleTests: [{ input: "abcabcbb", expectedOutput: "3" }],
      hiddenTests: [
        { input: "bbbbb", expectedOutput: "1" },
        { input: "pwwkew", expectedOutput: "3" },
      ],
    },
    {
      slug: "merge-intervals",
      title: "Merge Intervals",
      difficulty: Difficulty.HARD,
      description:
        "Given an array of intervals where `intervals[i] = [start_i, end_i]`, merge all " +
        "overlapping intervals and return the non-overlapping intervals sorted by start.",
      inputFormat: "One interval per line as `start end`, terminated by end of input.",
      outputFormat: "The merged intervals, one per line, as `start end`.",
      constraints: "1 <= intervals.length <= 10^4",
      examples: [{ input: "1 3\n2 6\n8 10\n15 18", output: "1 6\n8 10\n15 18" }],
      sampleTests: [{ input: "1 3\n2 6\n8 10\n15 18", expectedOutput: "1 6\n8 10\n15 18" }],
      hiddenTests: [{ input: "1 4\n4 5", expectedOutput: "1 5" }],
    },
  ];

  const blind75Problems = [
    {
      slug: "contains-duplicate",
      title: "Contains Duplicate",
      difficulty: Difficulty.EASY,
      description: "Given an integer array, return true if any value appears at least twice.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= n <= 10^5",
      examples: [{ input: "1 2 3 1", output: "true" }],
      sampleTests: [{ input: "1 2 3 1", expectedOutput: "true" }],
      hiddenTests: [{ input: "1 2 3 4", expectedOutput: "false" }],
    },
    {
      slug: "best-time-to-buy-and-sell-stock",
      title: "Best Time to Buy and Sell Stock",
      difficulty: Difficulty.EASY,
      description:
        "Given daily stock prices, choose one buy day and one later sell day to maximize profit.",
      inputFormat: "One line: space-separated prices.",
      outputFormat: "Single integer maximum profit.",
      constraints: "1 <= n <= 10^5",
      examples: [{ input: "7 1 5 3 6 4", output: "5" }],
      sampleTests: [{ input: "7 1 5 3 6 4", expectedOutput: "5" }],
      hiddenTests: [{ input: "7 6 4 3 1", expectedOutput: "0" }],
    },
    {
      slug: "product-of-array-except-self",
      title: "Product of Array Except Self",
      difficulty: Difficulty.MEDIUM,
      description:
        "Return an array where each index is the product of all other elements in the input.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "One line: space-separated integers.",
      constraints: "2 <= n <= 10^5",
      examples: [{ input: "1 2 3 4", output: "24 12 8 6" }],
      sampleTests: [{ input: "1 2 3 4", expectedOutput: "24 12 8 6" }],
      hiddenTests: [{ input: "-1 1 0 -3 3", expectedOutput: "0 0 9 0 0" }],
    },
    {
      slug: "maximum-subarray",
      title: "Maximum Subarray",
      difficulty: Difficulty.MEDIUM,
      description: "Return the largest possible sum over any contiguous subarray.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer maximum sum.",
      constraints: "1 <= n <= 10^5",
      examples: [{ input: "-2 1 -3 4 -1 2 1 -5 4", output: "6" }],
      sampleTests: [{ input: "-2 1 -3 4 -1 2 1 -5 4", expectedOutput: "6" }],
      hiddenTests: [{ input: "1", expectedOutput: "1" }],
    },
    {
      slug: "maximum-product-subarray",
      title: "Maximum Product Subarray",
      difficulty: Difficulty.MEDIUM,
      description: "Return the largest product over any contiguous subarray.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer maximum product.",
      constraints: "1 <= n <= 2 * 10^4",
      examples: [{ input: "2 3 -2 4", output: "6" }],
      sampleTests: [{ input: "2 3 -2 4", expectedOutput: "6" }],
      hiddenTests: [{ input: "-2 0 -1", expectedOutput: "0" }],
    },
    {
      slug: "find-minimum-in-rotated-sorted-array",
      title: "Find Minimum in Rotated Sorted Array",
      difficulty: Difficulty.MEDIUM,
      description: "Given a rotated sorted array with unique values, return the minimum value.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer minimum value.",
      constraints: "1 <= n <= 5000",
      examples: [{ input: "3 4 5 1 2", output: "1" }],
      sampleTests: [{ input: "3 4 5 1 2", expectedOutput: "1" }],
      hiddenTests: [{ input: "4 5 6 7 0 1 2", expectedOutput: "0" }],
    },
    {
      slug: "search-in-rotated-sorted-array",
      title: "Search in Rotated Sorted Array",
      difficulty: Difficulty.MEDIUM,
      description: "Find target index in a rotated sorted array, or return -1 if absent.",
      inputFormat:
        "First line: space-separated rotated sorted integers. Second line: integer target.",
      outputFormat: "Single integer index or -1.",
      constraints: "1 <= n <= 5000",
      examples: [{ input: "4 5 6 7 0 1 2\n0", output: "4" }],
      sampleTests: [{ input: "4 5 6 7 0 1 2\n0", expectedOutput: "4" }],
      hiddenTests: [{ input: "4 5 6 7 0 1 2\n3", expectedOutput: "-1" }],
    },
    {
      slug: "three-sum",
      title: "3Sum",
      difficulty: Difficulty.MEDIUM,
      description:
        "Return all unique triplets that sum to zero. Output each triplet sorted ascending.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "One triplet per line as `a b c`, sorted lexicographically.",
      constraints: "0 <= n <= 3000",
      examples: [{ input: "-1 0 1 2 -1 -4", output: "-1 -1 2\n-1 0 1" }],
      sampleTests: [{ input: "-1 0 1 2 -1 -4", expectedOutput: "-1 -1 2\n-1 0 1" }],
      hiddenTests: [{ input: "0 1 1", expectedOutput: "" }],
    },
    {
      slug: "container-with-most-water",
      title: "Container With Most Water",
      difficulty: Difficulty.MEDIUM,
      description: "Given vertical heights, return the maximum water area between two lines.",
      inputFormat: "One line: space-separated non-negative integers.",
      outputFormat: "Single integer max area.",
      constraints: "2 <= n <= 10^5",
      examples: [{ input: "1 8 6 2 5 4 8 3 7", output: "49" }],
      sampleTests: [{ input: "1 8 6 2 5 4 8 3 7", expectedOutput: "49" }],
      hiddenTests: [{ input: "1 1", expectedOutput: "1" }],
    },
    {
      slug: "longest-consecutive-sequence",
      title: "Longest Consecutive Sequence",
      difficulty: Difficulty.MEDIUM,
      description:
        "Return the length of the longest run of consecutive integers in an unsorted array.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer length.",
      constraints: "0 <= n <= 10^5",
      examples: [{ input: "100 4 200 1 3 2", output: "4" }],
      sampleTests: [{ input: "100 4 200 1 3 2", expectedOutput: "4" }],
      hiddenTests: [{ input: "0 3 7 2 5 8 4 6 0 1", expectedOutput: "9" }],
    },
    {
      slug: "valid-anagram",
      title: "Valid Anagram",
      difficulty: Difficulty.EASY,
      description: "Return true if two strings are anagrams of each other.",
      inputFormat: "First line: string s. Second line: string t.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= len(s), len(t) <= 5 * 10^4",
      examples: [{ input: "anagram\nnagaram", output: "true" }],
      sampleTests: [{ input: "anagram\nnagaram", expectedOutput: "true" }],
      hiddenTests: [{ input: "rat\ncar", expectedOutput: "false" }],
    },
    {
      slug: "group-anagrams",
      title: "Group Anagrams",
      difficulty: Difficulty.MEDIUM,
      description:
        "Group words that are anagrams. Sort words inside each group and groups by first word.",
      inputFormat: "One line: space-separated lowercase words.",
      outputFormat: "One group per line as space-separated words.",
      constraints: "1 <= n <= 10^4",
      examples: [{ input: "eat tea tan ate nat bat", output: "ate eat tea\nbat\nnat tan" }],
      sampleTests: [
        { input: "eat tea tan ate nat bat", expectedOutput: "ate eat tea\nbat\nnat tan" },
      ],
      hiddenTests: [{ input: "", expectedOutput: "" }],
    },
    {
      slug: "top-k-frequent-elements",
      title: "Top K Frequent Elements",
      difficulty: Difficulty.MEDIUM,
      description: "Return the k most frequent elements. Output values sorted ascending.",
      inputFormat: "First line: space-separated integers. Second line: integer k.",
      outputFormat: "One line: space-separated integers.",
      constraints: "1 <= n <= 10^5",
      examples: [{ input: "1 1 1 2 2 3\n2", output: "1 2" }],
      sampleTests: [{ input: "1 1 1 2 2 3\n2", expectedOutput: "1 2" }],
      hiddenTests: [{ input: "1\n1", expectedOutput: "1" }],
    },
    {
      slug: "valid-parentheses",
      title: "Valid Parentheses",
      difficulty: Difficulty.EASY,
      description: "Check whether a bracket string is balanced and correctly nested.",
      inputFormat: "One line: string containing ()[]{}.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= n <= 10^4",
      examples: [{ input: "()[]{}", output: "true" }],
      sampleTests: [{ input: "()[]{}", expectedOutput: "true" }],
      hiddenTests: [{ input: "(]", expectedOutput: "false" }],
    },
    {
      slug: "valid-palindrome",
      title: "Valid Palindrome",
      difficulty: Difficulty.EASY,
      description:
        "Ignoring non-alphanumeric characters and case, return true if the string is a palindrome.",
      inputFormat: "One line: string s.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= n <= 2 * 10^5",
      examples: [{ input: "A man, a plan, a canal: Panama", output: "true" }],
      sampleTests: [{ input: "A man, a plan, a canal: Panama", expectedOutput: "true" }],
      hiddenTests: [{ input: "race a car", expectedOutput: "false" }],
    },
    {
      slug: "longest-repeating-character-replacement",
      title: "Longest Repeating Character Replacement",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given uppercase string s and integer k, return max length of a substring that can be made of one repeating character with at most k replacements.",
      inputFormat: "First line: uppercase string s. Second line: integer k.",
      outputFormat: "Single integer length.",
      constraints: "1 <= n <= 10^5",
      examples: [{ input: "ABAB\n2", output: "4" }],
      sampleTests: [{ input: "ABAB\n2", expectedOutput: "4" }],
      hiddenTests: [{ input: "AABABBA\n1", expectedOutput: "4" }],
    },
    {
      slug: "minimum-window-substring",
      title: "Minimum Window Substring",
      difficulty: Difficulty.HARD,
      description: "Return the smallest substring of s that contains all characters of t.",
      inputFormat: "First line: string s. Second line: string t.",
      outputFormat: "Smallest valid window, or empty string.",
      constraints: "1 <= len(s), len(t) <= 10^5",
      examples: [{ input: "ADOBECODEBANC\nABC", output: "BANC" }],
      sampleTests: [{ input: "ADOBECODEBANC\nABC", expectedOutput: "BANC" }],
      hiddenTests: [{ input: "a\naa", expectedOutput: "" }],
    },
    {
      slug: "coin-change",
      title: "Coin Change",
      difficulty: Difficulty.MEDIUM,
      description: "Given coin values and a target amount, return the fewest coins needed, or -1.",
      inputFormat: "First line: space-separated coin values. Second line: target amount.",
      outputFormat: "Single integer.",
      constraints: "1 <= amount <= 10^4",
      examples: [{ input: "1 2 5\n11", output: "3" }],
      sampleTests: [{ input: "1 2 5\n11", expectedOutput: "3" }],
      hiddenTests: [{ input: "2\n3", expectedOutput: "-1" }],
    },
    {
      slug: "climbing-stairs",
      title: "Climbing Stairs",
      difficulty: Difficulty.EASY,
      description:
        "You can climb 1 or 2 steps. Return the number of distinct ways to reach step n.",
      inputFormat: "One line: integer n.",
      outputFormat: "Single integer number of ways.",
      constraints: "1 <= n <= 45",
      examples: [{ input: "2", output: "2" }],
      sampleTests: [{ input: "2", expectedOutput: "2" }],
      hiddenTests: [{ input: "3", expectedOutput: "3" }],
    },
    {
      slug: "house-robber",
      title: "House Robber",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given non-negative house values in a line, maximize robbed sum without adjacent picks.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer max sum.",
      constraints: "1 <= n <= 100",
      examples: [{ input: "1 2 3 1", output: "4" }],
      sampleTests: [{ input: "1 2 3 1", expectedOutput: "4" }],
      hiddenTests: [{ input: "2 7 9 3 1", expectedOutput: "12" }],
    },
    {
      slug: "house-robber-ii",
      title: "House Robber II",
      difficulty: Difficulty.MEDIUM,
      description: "Same as House Robber, but houses form a circle (first and last are adjacent).",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer max sum.",
      constraints: "1 <= n <= 100",
      examples: [{ input: "2 3 2", output: "3" }],
      sampleTests: [{ input: "2 3 2", expectedOutput: "3" }],
      hiddenTests: [{ input: "1 2 3 1", expectedOutput: "4" }],
    },
    {
      slug: "decode-ways",
      title: "Decode Ways",
      difficulty: Difficulty.MEDIUM,
      description: "Given a digit string, return how many valid alphabet decodings exist.",
      inputFormat: "One line: digit string s.",
      outputFormat: "Single integer number of decodings.",
      constraints: "1 <= n <= 100",
      examples: [{ input: "12", output: "2" }],
      sampleTests: [{ input: "12", expectedOutput: "2" }],
      hiddenTests: [{ input: "226", expectedOutput: "3" }],
    },
    {
      slug: "unique-paths",
      title: "Unique Paths",
      difficulty: Difficulty.MEDIUM,
      description:
        "Robot moves only right or down on an m x n grid. Return number of unique paths.",
      inputFormat: "One line: two integers m n.",
      outputFormat: "Single integer path count.",
      constraints: "1 <= m, n <= 100",
      examples: [{ input: "3 7", output: "28" }],
      sampleTests: [{ input: "3 7", expectedOutput: "28" }],
      hiddenTests: [{ input: "3 2", expectedOutput: "3" }],
    },
    {
      slug: "jump-game",
      title: "Jump Game",
      difficulty: Difficulty.MEDIUM,
      description:
        "Each value is max jump length from that index. Return true if last index is reachable.",
      inputFormat: "One line: space-separated non-negative integers.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= n <= 10^4",
      examples: [{ input: "2 3 1 1 4", output: "true" }],
      sampleTests: [{ input: "2 3 1 1 4", expectedOutput: "true" }],
      hiddenTests: [{ input: "3 2 1 0 4", expectedOutput: "false" }],
    },
    {
      slug: "number-of-islands",
      title: "Number of Islands",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given a grid of 0s and 1s, count connected components of 1s using 4-direction adjacency.",
      inputFormat:
        "First line: rows and cols as `r c`. Next r lines: c values (`0` or `1`) separated by spaces.",
      outputFormat: "Single integer island count.",
      constraints: "1 <= r, c <= 300",
      examples: [{ input: "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", output: "1" }],
      sampleTests: [
        { input: "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", expectedOutput: "1" },
      ],
      hiddenTests: [
        { input: "4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1", expectedOutput: "3" },
      ],
    },
    {
      slug: "course-schedule",
      title: "Course Schedule",
      difficulty: Difficulty.MEDIUM,
      description:
        "Given number of courses and prerequisite pairs, return true if all courses can be finished.",
      inputFormat:
        "First line: integer n (courses). Second line: integer m (pairs). Next m lines: `a b` meaning b before a.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= n <= 2000",
      examples: [{ input: "2\n1\n1 0", output: "true" }],
      sampleTests: [{ input: "2\n1\n1 0", expectedOutput: "true" }],
      hiddenTests: [{ input: "2\n2\n1 0\n0 1", expectedOutput: "false" }],
    },
    {
      slug: "insert-interval",
      title: "Insert Interval",
      difficulty: Difficulty.MEDIUM,
      description: "Insert one interval into sorted non-overlapping intervals and merge if needed.",
      inputFormat:
        "First line: integer n. Next n lines: intervals `start end`. Final line: new interval `start end`.",
      outputFormat: "Merged intervals, one per line as `start end`.",
      constraints: "0 <= n <= 10^4",
      examples: [{ input: "2\n1 3\n6 9\n2 5", output: "1 5\n6 9" }],
      sampleTests: [{ input: "2\n1 3\n6 9\n2 5", expectedOutput: "1 5\n6 9" }],
      hiddenTests: [
        { input: "5\n1 2\n3 5\n6 7\n8 10\n12 16\n4 8", expectedOutput: "1 2\n3 10\n12 16" },
      ],
    },
    {
      slug: "non-overlapping-intervals",
      title: "Non-overlapping Intervals",
      difficulty: Difficulty.MEDIUM,
      description: "Return minimum number of intervals to remove so the rest do not overlap.",
      inputFormat: "First line: n. Next n lines: intervals `start end`.",
      outputFormat: "Single integer removals.",
      constraints: "1 <= n <= 10^5",
      examples: [{ input: "3\n1 2\n2 3\n3 4", output: "0" }],
      sampleTests: [{ input: "3\n1 2\n2 3\n3 4", expectedOutput: "0" }],
      hiddenTests: [{ input: "3\n1 2\n1 2\n1 2", expectedOutput: "2" }],
    },
  ];

  const blind75ExpansionProblems = [
    {
      slug: "sum-of-two-integers",
      title: "Sum of Two Integers",
      difficulty: Difficulty.MEDIUM,
      description: "Compute the sum of two integers without using + or - operators.",
      inputFormat: "One line: two integers a b.",
      outputFormat: "Single integer sum.",
      constraints: "-1000 <= a, b <= 1000",
      examples: [{ input: "1 2", output: "3" }],
      sampleTests: [{ input: "1 2", expectedOutput: "3" }],
      hiddenTests: [{ input: "-2 3", expectedOutput: "1" }],
    },
    {
      slug: "number-of-1-bits",
      title: "Number of 1 Bits",
      difficulty: Difficulty.EASY,
      description: "Return how many set bits appear in the binary form of a non-negative integer.",
      inputFormat: "One line: integer n.",
      outputFormat: "Single integer bit count.",
      constraints: "0 <= n <= 2^31-1",
      examples: [{ input: "11", output: "3" }],
      sampleTests: [{ input: "11", expectedOutput: "3" }],
      hiddenTests: [{ input: "128", expectedOutput: "1" }],
    },
    {
      slug: "counting-bits",
      title: "Counting Bits",
      difficulty: Difficulty.EASY,
      description: "For every i in [0, n], output the number of set bits in i.",
      inputFormat: "One line: integer n.",
      outputFormat: "One line: n+1 space-separated integers.",
      constraints: "0 <= n <= 10^5",
      examples: [{ input: "2", output: "0 1 1" }],
      sampleTests: [{ input: "2", expectedOutput: "0 1 1" }],
      hiddenTests: [{ input: "5", expectedOutput: "0 1 1 2 1 2" }],
    },
    {
      slug: "missing-number",
      title: "Missing Number",
      difficulty: Difficulty.EASY,
      description: "Given n distinct numbers from [0, n], return the one missing number.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer missing value.",
      constraints: "1 <= n <= 10^5",
      examples: [{ input: "3 0 1", output: "2" }],
      sampleTests: [{ input: "3 0 1", expectedOutput: "2" }],
      hiddenTests: [{ input: "0 1", expectedOutput: "2" }],
    },
    {
      slug: "reverse-bits",
      title: "Reverse Bits",
      difficulty: Difficulty.EASY,
      description: "Reverse the bits of a 32-bit unsigned integer.",
      inputFormat: "One line: unsigned integer n.",
      outputFormat: "Single unsigned integer result.",
      constraints: "0 <= n < 2^32",
      examples: [{ input: "43261596", output: "964176192" }],
      sampleTests: [{ input: "43261596", expectedOutput: "964176192" }],
      hiddenTests: [{ input: "0", expectedOutput: "0" }],
    },
    {
      slug: "longest-increasing-subsequence",
      title: "Longest Increasing Subsequence",
      difficulty: Difficulty.MEDIUM,
      description: "Return the length of the longest strictly increasing subsequence.",
      inputFormat: "One line: space-separated integers.",
      outputFormat: "Single integer LIS length.",
      constraints: "1 <= n <= 2500",
      examples: [{ input: "10 9 2 5 3 7 101 18", output: "4" }],
      sampleTests: [{ input: "10 9 2 5 3 7 101 18", expectedOutput: "4" }],
      hiddenTests: [{ input: "0 1 0 3 2 3", expectedOutput: "4" }],
    },
    {
      slug: "longest-common-subsequence",
      title: "Longest Common Subsequence",
      difficulty: Difficulty.MEDIUM,
      description: "Return the length of the longest subsequence common to two strings.",
      inputFormat: "First line: string a. Second line: string b.",
      outputFormat: "Single integer LCS length.",
      constraints: "1 <= len(a), len(b) <= 1000",
      examples: [{ input: "abcde\nace", output: "3" }],
      sampleTests: [{ input: "abcde\nace", expectedOutput: "3" }],
      hiddenTests: [{ input: "abc\nabc", expectedOutput: "3" }],
    },
    {
      slug: "word-break",
      title: "Word Break",
      difficulty: Difficulty.MEDIUM,
      description: "Return true if string s can be segmented into one or more dictionary words.",
      inputFormat: "First line: string s. Second line: dictionary words separated by spaces.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= len(s) <= 300",
      examples: [{ input: "leetcode\nleet code", output: "true" }],
      sampleTests: [{ input: "leetcode\nleet code", expectedOutput: "true" }],
      hiddenTests: [{ input: "catsandog\ncats dog sand and cat", expectedOutput: "false" }],
    },
    {
      slug: "combination-sum",
      title: "Combination Sum",
      difficulty: Difficulty.MEDIUM,
      description: "Return unique combinations whose numbers sum to target; numbers may be reused.",
      inputFormat: "First line: candidates as space-separated integers. Second line: target.",
      outputFormat:
        "One combination per line sorted ascending; combinations sorted lexicographically.",
      constraints: "1 <= candidates.length <= 30",
      examples: [{ input: "2 3 6 7\n7", output: "2 2 3\n7" }],
      sampleTests: [{ input: "2 3 6 7\n7", expectedOutput: "2 2 3\n7" }],
      hiddenTests: [{ input: "2 3 5\n8", expectedOutput: "2 2 2 2\n2 3 3\n3 5" }],
    },
    {
      slug: "clone-graph",
      title: "Clone Graph",
      difficulty: Difficulty.MEDIUM,
      description:
        "Deep-copy an undirected graph and return an equivalent adjacency list from node 1.",
      inputFormat: "Adjacency list lines: `node: neighbors` using 1-indexed labels.",
      outputFormat: "Adjacency list of cloned graph in same format.",
      constraints: "1 <= nodes <= 100",
      examples: [
        { input: "1: 2 4\n2: 1 3\n3: 2 4\n4: 1 3", output: "1: 2 4\n2: 1 3\n3: 2 4\n4: 1 3" },
      ],
      sampleTests: [{ input: "1: 2\n2: 1", expectedOutput: "1: 2\n2: 1" }],
      hiddenTests: [{ input: "1:", expectedOutput: "1:" }],
    },
    {
      slug: "pacific-atlantic-water-flow",
      title: "Pacific Atlantic Water Flow",
      difficulty: Difficulty.MEDIUM,
      description: "Return all coordinates from which water can flow to both oceans.",
      inputFormat: "First line: r c. Next r lines: c heights.",
      outputFormat: "Coordinates as `row col`, one per line sorted lexicographically.",
      constraints: "1 <= r, c <= 200",
      examples: [{ input: "1 1\n5", output: "0 0" }],
      sampleTests: [{ input: "1 1\n5", expectedOutput: "0 0" }],
      hiddenTests: [{ input: "2 2\n1 2\n4 3", expectedOutput: "0 1\n1 0\n1 1" }],
    },
    {
      slug: "alien-dictionary",
      title: "Alien Dictionary",
      difficulty: Difficulty.HARD,
      description:
        "Given sorted words in an unknown alphabet, return one valid character ordering.",
      inputFormat: "One line: space-separated words.",
      outputFormat: "String order, or empty string if invalid.",
      constraints: "1 <= words.length <= 100",
      examples: [{ input: "wrt wrf er ett rftt", output: "wertf" }],
      sampleTests: [{ input: "wrt wrf er ett rftt", expectedOutput: "wertf" }],
      hiddenTests: [{ input: "z x z", expectedOutput: "" }],
    },
    {
      slug: "graph-valid-tree",
      title: "Graph Valid Tree",
      difficulty: Difficulty.MEDIUM,
      description: "Determine if an undirected graph is a tree (connected and acyclic).",
      inputFormat: "First line: n m. Next m lines: edges `u v`.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= n <= 2000",
      examples: [{ input: "5 4\n0 1\n0 2\n0 3\n1 4", output: "true" }],
      sampleTests: [{ input: "5 4\n0 1\n0 2\n0 3\n1 4", expectedOutput: "true" }],
      hiddenTests: [{ input: "5 5\n0 1\n1 2\n2 3\n1 3\n1 4", expectedOutput: "false" }],
    },
    {
      slug: "number-of-connected-components-in-an-undirected-graph",
      title: "Number of Connected Components in an Undirected Graph",
      difficulty: Difficulty.MEDIUM,
      description: "Count connected components in an undirected graph.",
      inputFormat: "First line: n m. Next m lines: edges `u v`.",
      outputFormat: "Single integer component count.",
      constraints: "1 <= n <= 2000",
      examples: [{ input: "5 2\n0 1\n1 2", output: "3" }],
      sampleTests: [{ input: "5 2\n0 1\n1 2", expectedOutput: "3" }],
      hiddenTests: [{ input: "5 4\n0 1\n1 2\n2 3\n3 4", expectedOutput: "1" }],
    },
    {
      slug: "meeting-rooms",
      title: "Meeting Rooms",
      difficulty: Difficulty.EASY,
      description: "Given meeting intervals, return true if a person can attend all meetings.",
      inputFormat: "First line: n. Next n lines: intervals `start end`.",
      outputFormat: "`true` or `false`.",
      constraints: "0 <= n <= 10^4",
      examples: [{ input: "2\n0 30\n5 10", output: "false" }],
      sampleTests: [{ input: "2\n0 30\n5 10", expectedOutput: "false" }],
      hiddenTests: [{ input: "2\n7 10\n2 4", expectedOutput: "true" }],
    },
    {
      slug: "meeting-rooms-ii",
      title: "Meeting Rooms II",
      difficulty: Difficulty.MEDIUM,
      description: "Return the minimum number of meeting rooms needed for all intervals.",
      inputFormat: "First line: n. Next n lines: intervals `start end`.",
      outputFormat: "Single integer room count.",
      constraints: "1 <= n <= 10^4",
      examples: [{ input: "3\n0 30\n5 10\n15 20", output: "2" }],
      sampleTests: [{ input: "3\n0 30\n5 10\n15 20", expectedOutput: "2" }],
      hiddenTests: [{ input: "3\n7 10\n2 4\n3 5", expectedOutput: "2" }],
    },
    {
      slug: "reverse-linked-list",
      title: "Reverse Linked List",
      difficulty: Difficulty.EASY,
      description: "Reverse a singly linked list and return the new head sequence.",
      inputFormat: "One line: list values space-separated.",
      outputFormat: "One line: reversed values space-separated.",
      constraints: "0 <= n <= 5000",
      examples: [{ input: "1 2 3 4 5", output: "5 4 3 2 1" }],
      sampleTests: [{ input: "1 2 3 4 5", expectedOutput: "5 4 3 2 1" }],
      hiddenTests: [{ input: "1 2", expectedOutput: "2 1" }],
    },
    {
      slug: "linked-list-cycle",
      title: "Linked List Cycle",
      difficulty: Difficulty.EASY,
      description: "Return true if a linked list contains a cycle.",
      inputFormat: "First line: list values. Second line: cycle index (-1 for none).",
      outputFormat: "`true` or `false`.",
      constraints: "0 <= n <= 10^4",
      examples: [{ input: "3 2 0 -4\n1", output: "true" }],
      sampleTests: [{ input: "3 2 0 -4\n1", expectedOutput: "true" }],
      hiddenTests: [{ input: "1\n-1", expectedOutput: "false" }],
    },
    {
      slug: "merge-two-sorted-lists",
      title: "Merge Two Sorted Lists",
      difficulty: Difficulty.EASY,
      description: "Merge two sorted linked lists and output the merged sorted sequence.",
      inputFormat: "First line: list A values. Second line: list B values.",
      outputFormat: "One line: merged values.",
      constraints: "0 <= n,m <= 50",
      examples: [{ input: "1 2 4\n1 3 4", output: "1 1 2 3 4 4" }],
      sampleTests: [{ input: "1 2 4\n1 3 4", expectedOutput: "1 1 2 3 4 4" }],
      hiddenTests: [{ input: "\n", expectedOutput: "" }],
    },
    {
      slug: "merge-k-sorted-lists",
      title: "Merge K Sorted Lists",
      difficulty: Difficulty.HARD,
      description: "Merge k sorted linked lists and output a single sorted sequence.",
      inputFormat: "Lists separated by `|`, values space-separated inside each list.",
      outputFormat: "One line: merged values.",
      constraints: "0 <= k <= 10^4",
      examples: [{ input: "1 4 5|1 3 4|2 6", output: "1 1 2 3 4 4 5 6" }],
      sampleTests: [{ input: "1 4 5|1 3 4|2 6", expectedOutput: "1 1 2 3 4 4 5 6" }],
      hiddenTests: [{ input: "", expectedOutput: "" }],
    },
    {
      slug: "remove-nth-node-from-end-of-list",
      title: "Remove Nth Node From End of List",
      difficulty: Difficulty.MEDIUM,
      description:
        "Remove the nth node from the end of a linked list and output resulting sequence.",
      inputFormat: "First line: list values. Second line: integer n.",
      outputFormat: "One line: remaining values.",
      constraints: "1 <= list length <= 30",
      examples: [{ input: "1 2 3 4 5\n2", output: "1 2 3 5" }],
      sampleTests: [{ input: "1 2 3 4 5\n2", expectedOutput: "1 2 3 5" }],
      hiddenTests: [{ input: "1\n1", expectedOutput: "" }],
    },
    {
      slug: "reorder-list",
      title: "Reorder List",
      difficulty: Difficulty.MEDIUM,
      description: "Reorder list as L0->Ln->L1->Ln-1... and output the reordered sequence.",
      inputFormat: "One line: list values.",
      outputFormat: "One line: reordered values.",
      constraints: "1 <= n <= 5 * 10^4",
      examples: [{ input: "1 2 3 4", output: "1 4 2 3" }],
      sampleTests: [{ input: "1 2 3 4", expectedOutput: "1 4 2 3" }],
      hiddenTests: [{ input: "1 2 3 4 5", expectedOutput: "1 5 2 4 3" }],
    },
    {
      slug: "set-matrix-zeroes",
      title: "Set Matrix Zeroes",
      difficulty: Difficulty.MEDIUM,
      description: "If an element is zero, set its entire row and column to zero.",
      inputFormat: "First line: r c. Next r lines: c integers.",
      outputFormat: "Result matrix with one row per line.",
      constraints: "1 <= r, c <= 200",
      examples: [{ input: "3 3\n1 1 1\n1 0 1\n1 1 1", output: "1 0 1\n0 0 0\n1 0 1" }],
      sampleTests: [{ input: "3 3\n1 1 1\n1 0 1\n1 1 1", expectedOutput: "1 0 1\n0 0 0\n1 0 1" }],
      hiddenTests: [
        { input: "3 4\n0 1 2 0\n3 4 5 2\n1 3 1 5", expectedOutput: "0 0 0 0\n0 4 5 0\n0 3 1 0" },
      ],
    },
    {
      slug: "spiral-matrix",
      title: "Spiral Matrix",
      difficulty: Difficulty.MEDIUM,
      description: "Return all matrix elements in clockwise spiral order.",
      inputFormat: "First line: r c. Next r lines: c integers.",
      outputFormat: "One line: spiral order values.",
      constraints: "1 <= r, c <= 10",
      examples: [{ input: "3 3\n1 2 3\n4 5 6\n7 8 9", output: "1 2 3 6 9 8 7 4 5" }],
      sampleTests: [{ input: "3 3\n1 2 3\n4 5 6\n7 8 9", expectedOutput: "1 2 3 6 9 8 7 4 5" }],
      hiddenTests: [
        {
          input: "3 4\n1 2 3 4\n5 6 7 8\n9 10 11 12",
          expectedOutput: "1 2 3 4 8 12 11 10 9 5 6 7",
        },
      ],
    },
    {
      slug: "rotate-image",
      title: "Rotate Image",
      difficulty: Difficulty.MEDIUM,
      description: "Rotate an n x n matrix 90 degrees clockwise.",
      inputFormat: "First line: n. Next n lines: n integers.",
      outputFormat: "Rotated matrix rows.",
      constraints: "1 <= n <= 20",
      examples: [{ input: "3\n1 2 3\n4 5 6\n7 8 9", output: "7 4 1\n8 5 2\n9 6 3" }],
      sampleTests: [{ input: "3\n1 2 3\n4 5 6\n7 8 9", expectedOutput: "7 4 1\n8 5 2\n9 6 3" }],
      hiddenTests: [{ input: "2\n1 2\n3 4", expectedOutput: "3 1\n4 2" }],
    },
    {
      slug: "word-search",
      title: "Word Search",
      difficulty: Difficulty.MEDIUM,
      description: "Return true if word exists in a grid by moving horizontally or vertically.",
      inputFormat: "First line: r c. Next r lines: chars. Final line: target word.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= r, c <= 6",
      examples: [{ input: "3 4\nA B C E\nS F C S\nA D E E\nABCCED", output: "true" }],
      sampleTests: [{ input: "3 4\nA B C E\nS F C S\nA D E E\nABCCED", expectedOutput: "true" }],
      hiddenTests: [{ input: "3 4\nA B C E\nS F C S\nA D E E\nABCB", expectedOutput: "false" }],
    },
    {
      slug: "palindromic-substrings",
      title: "Palindromic Substrings",
      difficulty: Difficulty.MEDIUM,
      description: "Count all palindromic substrings in a string.",
      inputFormat: "One line: string s.",
      outputFormat: "Single integer count.",
      constraints: "1 <= n <= 1000",
      examples: [{ input: "abc", output: "3" }],
      sampleTests: [{ input: "abc", expectedOutput: "3" }],
      hiddenTests: [{ input: "aaa", expectedOutput: "6" }],
    },
    {
      slug: "encode-and-decode-strings",
      title: "Encode and Decode Strings",
      difficulty: Difficulty.MEDIUM,
      description: "Design reversible encode/decode for a list of strings.",
      inputFormat: "One line: strings separated by `|`.",
      outputFormat: "Decoded strings separated by `|` after round-trip.",
      constraints: "0 <= strings.length <= 200",
      examples: [{ input: "lint|code|love|you", output: "lint|code|love|you" }],
      sampleTests: [{ input: "lint|code|love|you", expectedOutput: "lint|code|love|you" }],
      hiddenTests: [{ input: "we|say|:|yes", expectedOutput: "we|say|:|yes" }],
    },
    {
      slug: "maximum-depth-of-binary-tree",
      title: "Maximum Depth of Binary Tree",
      difficulty: Difficulty.EASY,
      description: "Return the maximum depth of a binary tree.",
      inputFormat: "Level-order list with `null` placeholders.",
      outputFormat: "Single integer depth.",
      constraints: "0 <= nodes <= 10^4",
      examples: [{ input: "3 9 20 null null 15 7", output: "3" }],
      sampleTests: [{ input: "3 9 20 null null 15 7", expectedOutput: "3" }],
      hiddenTests: [{ input: "1 null 2", expectedOutput: "2" }],
    },
    {
      slug: "same-tree",
      title: "Same Tree",
      difficulty: Difficulty.EASY,
      description: "Return true if two binary trees are structurally identical with equal values.",
      inputFormat: "First line: tree A level-order. Second line: tree B level-order.",
      outputFormat: "`true` or `false`.",
      constraints: "0 <= nodes <= 100",
      examples: [{ input: "1 2 3\n1 2 3", output: "true" }],
      sampleTests: [{ input: "1 2 3\n1 2 3", expectedOutput: "true" }],
      hiddenTests: [{ input: "1 2\n1 null 2", expectedOutput: "false" }],
    },
    {
      slug: "invert-binary-tree",
      title: "Invert Binary Tree",
      difficulty: Difficulty.EASY,
      description: "Invert a binary tree by swapping left and right children at every node.",
      inputFormat: "Tree in level-order with `null` placeholders.",
      outputFormat: "Inverted tree in level-order.",
      constraints: "0 <= nodes <= 100",
      examples: [{ input: "4 2 7 1 3 6 9", output: "4 7 2 9 6 3 1" }],
      sampleTests: [{ input: "4 2 7 1 3 6 9", expectedOutput: "4 7 2 9 6 3 1" }],
      hiddenTests: [{ input: "2 1 3", expectedOutput: "2 3 1" }],
    },
    {
      slug: "binary-tree-maximum-path-sum",
      title: "Binary Tree Maximum Path Sum",
      difficulty: Difficulty.HARD,
      description: "Return the maximum path sum in a binary tree.",
      inputFormat: "Tree in level-order with `null` placeholders.",
      outputFormat: "Single integer max path sum.",
      constraints: "1 <= nodes <= 3 * 10^4",
      examples: [{ input: "1 2 3", output: "6" }],
      sampleTests: [{ input: "1 2 3", expectedOutput: "6" }],
      hiddenTests: [{ input: "-10 9 20 null null 15 7", expectedOutput: "42" }],
    },
    {
      slug: "binary-tree-level-order-traversal",
      title: "Binary Tree Level Order Traversal",
      difficulty: Difficulty.MEDIUM,
      description: "Return level-order traversal values grouped by level.",
      inputFormat: "Tree in level-order with `null` placeholders.",
      outputFormat: "One level per line.",
      constraints: "0 <= nodes <= 2000",
      examples: [{ input: "3 9 20 null null 15 7", output: "3\n9 20\n15 7" }],
      sampleTests: [{ input: "3 9 20 null null 15 7", expectedOutput: "3\n9 20\n15 7" }],
      hiddenTests: [{ input: "1", expectedOutput: "1" }],
    },
    {
      slug: "serialize-and-deserialize-binary-tree",
      title: "Serialize and Deserialize Binary Tree",
      difficulty: Difficulty.HARD,
      description:
        "Implement serialize/deserialize and return canonical serialized output after round-trip.",
      inputFormat: "Tree in level-order with `null` placeholders.",
      outputFormat: "Canonical serialized tree.",
      constraints: "0 <= nodes <= 10^4",
      examples: [{ input: "1 2 3 null null 4 5", output: "1 2 3 null null 4 5" }],
      sampleTests: [{ input: "1 2 3 null null 4 5", expectedOutput: "1 2 3 null null 4 5" }],
      hiddenTests: [{ input: "", expectedOutput: "" }],
    },
    {
      slug: "subtree-of-another-tree",
      title: "Subtree of Another Tree",
      difficulty: Difficulty.EASY,
      description: "Return true if subRoot appears as a subtree of root.",
      inputFormat: "First line: root tree level-order. Second line: subRoot tree level-order.",
      outputFormat: "`true` or `false`.",
      constraints: "0 <= nodes <= 2000",
      examples: [{ input: "3 4 5 1 2\n4 1 2", output: "true" }],
      sampleTests: [{ input: "3 4 5 1 2\n4 1 2", expectedOutput: "true" }],
      hiddenTests: [{ input: "3 4 5 1 2 null null null null 0\n4 1 2", expectedOutput: "false" }],
    },
    {
      slug: "construct-binary-tree-from-preorder-and-inorder-traversal",
      title: "Construct Binary Tree from Preorder and Inorder Traversal",
      difficulty: Difficulty.MEDIUM,
      description:
        "Build a binary tree from preorder and inorder arrays and output level-order form.",
      inputFormat: "First line: preorder values. Second line: inorder values.",
      outputFormat: "Level-order with `null` placeholders trimmed.",
      constraints: "1 <= nodes <= 3000",
      examples: [{ input: "3 9 20 15 7\n9 3 15 20 7", output: "3 9 20 null null 15 7" }],
      sampleTests: [{ input: "3 9 20 15 7\n9 3 15 20 7", expectedOutput: "3 9 20 null null 15 7" }],
      hiddenTests: [{ input: "1\n1", expectedOutput: "1" }],
    },
    {
      slug: "validate-binary-search-tree",
      title: "Validate Binary Search Tree",
      difficulty: Difficulty.MEDIUM,
      description: "Return true if a binary tree satisfies BST ordering rules.",
      inputFormat: "Tree in level-order with `null` placeholders.",
      outputFormat: "`true` or `false`.",
      constraints: "1 <= nodes <= 10^4",
      examples: [{ input: "2 1 3", output: "true" }],
      sampleTests: [{ input: "2 1 3", expectedOutput: "true" }],
      hiddenTests: [{ input: "5 1 4 null null 3 6", expectedOutput: "false" }],
    },
    {
      slug: "kth-smallest-element-in-a-bst",
      title: "Kth Smallest Element in a BST",
      difficulty: Difficulty.MEDIUM,
      description: "Return the kth smallest value in a BST.",
      inputFormat: "First line: tree level-order. Second line: integer k.",
      outputFormat: "Single integer answer.",
      constraints: "1 <= k <= nodes <= 10^4",
      examples: [{ input: "3 1 4 null 2\n1", output: "1" }],
      sampleTests: [{ input: "3 1 4 null 2\n1", expectedOutput: "1" }],
      hiddenTests: [{ input: "5 3 6 2 4 null null 1\n3", expectedOutput: "3" }],
    },
    {
      slug: "lowest-common-ancestor-of-a-binary-search-tree",
      title: "Lowest Common Ancestor of a Binary Search Tree",
      difficulty: Difficulty.MEDIUM,
      description: "Return the lowest common ancestor value of two nodes in a BST.",
      inputFormat: "First line: BST level-order. Second line: values p q.",
      outputFormat: "Single integer LCA value.",
      constraints: "2 <= nodes <= 10^5",
      examples: [{ input: "6 2 8 0 4 7 9 null null 3 5\n2 8", output: "6" }],
      sampleTests: [{ input: "6 2 8 0 4 7 9 null null 3 5\n2 8", expectedOutput: "6" }],
      hiddenTests: [{ input: "6 2 8 0 4 7 9 null null 3 5\n2 4", expectedOutput: "2" }],
    },
    {
      slug: "implement-trie-prefix-tree",
      title: "Implement Trie (Prefix Tree)",
      difficulty: Difficulty.MEDIUM,
      description: "Implement insert, search, and startsWith for a trie.",
      inputFormat: "Operations lines: `op value`, where op in {insert, search, startsWith}.",
      outputFormat: "Outputs for search/startsWith operations, one per line.",
      constraints: "1 <= operations <= 3 * 10^4",
      examples: [
        {
          input: "insert apple\nsearch apple\nsearch app\nstartsWith app\ninsert app\nsearch app",
          output: "true\nfalse\ntrue\ntrue",
        },
      ],
      sampleTests: [
        {
          input: "insert apple\nsearch apple\nsearch app\nstartsWith app\ninsert app\nsearch app",
          expectedOutput: "true\nfalse\ntrue\ntrue",
        },
      ],
      hiddenTests: [{ input: "insert a\nsearch a\nstartsWith b", expectedOutput: "true\nfalse" }],
    },
    {
      slug: "add-and-search-word-data-structure-design",
      title: "Add and Search Word - Data structure design",
      difficulty: Difficulty.MEDIUM,
      description: "Design a word dictionary supporting addWord and search with '.' wildcard.",
      inputFormat: "Operations lines: `op value`, where op in {addWord, search}.",
      outputFormat: "Outputs for search operations, one per line.",
      constraints: "1 <= operations <= 10^4",
      examples: [
        {
          input:
            "addWord bad\naddWord dad\naddWord mad\nsearch pad\nsearch bad\nsearch .ad\nsearch b..",
          output: "false\ntrue\ntrue\ntrue",
        },
      ],
      sampleTests: [
        {
          input:
            "addWord bad\naddWord dad\naddWord mad\nsearch pad\nsearch bad\nsearch .ad\nsearch b..",
          expectedOutput: "false\ntrue\ntrue\ntrue",
        },
      ],
      hiddenTests: [
        { input: "addWord a\naddWord ab\nsearch a.\nsearch .", expectedOutput: "true\ntrue" },
      ],
    },
  ];

  const allProblems = [...problems, ...blind75Problems, ...blind75ExpansionProblems].map((p) =>
    expandProblemTests(p as SeedProblem),
  );

  for (const p of allProblems) {
    await prisma.problem.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        description: p.description,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        constraints: p.constraints,
        examples: p.examples,
        difficulty: p.difficulty,
        supportedLanguages: [Language.PYTHON, Language.JAVASCRIPT, Language.CPP],
        testCases: {
          deleteMany: {},
          create: [
            ...p.sampleTests.map((t) => ({ ...t, isSample: true })),
            ...p.hiddenTests.map((t) => ({ ...t, isSample: false })),
          ],
        },
      },
      create: {
        slug: p.slug,
        title: p.title,
        description: p.description,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        constraints: p.constraints,
        examples: p.examples,
        difficulty: p.difficulty,
        supportedLanguages: [Language.PYTHON, Language.JAVASCRIPT, Language.CPP],
        testCases: {
          create: [
            ...p.sampleTests.map((t) => ({ ...t, isSample: true })),
            ...p.hiddenTests.map((t) => ({ ...t, isSample: false })),
          ],
        },
      },
    });
  }

  const now = new Date();
  await prisma.contest.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "CodeArena Launch Contest",
      description: "Seed contest for local development; configured fully in Milestone 4.",
      startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 27 * 60 * 60 * 1000),
      visibility: "PUBLIC",
    },
  });

  console.log("Seeded:", {
    admin: admin.email,
    contestants: [contestantOne.email, contestantTwo.email],
    problems: allProblems.length,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
