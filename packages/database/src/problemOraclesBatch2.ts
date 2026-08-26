import { parseNumberTokens } from "./problemOracles.js";
import type { SeedTestInput } from "./problemOracles.js";

export const BATCH2_SLUGS = [
  "two-sum",
  "contains-duplicate",
  "maximum-subarray",
  "product-of-array-except-self",
  "best-time-to-buy-and-sell-stock",
  "container-with-most-water",
  "three-sum",
  "missing-number",
  "valid-anagram",
  "valid-palindrome",
  "valid-parentheses",
  "longest-substring",
  "longest-repeating-character-replacement",
  "reverse-linked-list",
  "linked-list-cycle",
  "remove-nth-node-from-end-of-list",
  "reorder-list",
  "merge-intervals",
  "insert-interval",
  "top-k-frequent-elements",
] as const;

export type Batch2Slug = (typeof BATCH2_SLUGS)[number];

/**
 * Unique (input, expectedOutput) pair count already present in
 * codearena_restored for each slug, as measured before Batch 2 (2026-08-26).
 * Used only as a static baseline for the local oracle test's reachability
 * check; the sync script re-measures the live count and is authoritative.
 */
export const BATCH2_BASELINE_UNIQUE_COUNT: Record<Batch2Slug, number> = {
  "two-sum": 17,
  "contains-duplicate": 16,
  "maximum-subarray": 16,
  "product-of-array-except-self": 4,
  "best-time-to-buy-and-sell-stock": 16,
  "container-with-most-water": 13,
  "three-sum": 4,
  "missing-number": 4,
  "valid-anagram": 4,
  "valid-palindrome": 4,
  "valid-parentheses": 4,
  "longest-substring": 7,
  "longest-repeating-character-replacement": 4,
  "reverse-linked-list": 4,
  "linked-list-cycle": 4,
  "remove-nth-node-from-end-of-list": 4,
  "reorder-list": 4,
  "merge-intervals": 4,
  "insert-interval": 4,
  "top-k-frequent-elements": 10,
};

// Only slugs below the 7-unique-pair floor get new inputs; slugs already at
// or above it (two-sum, contains-duplicate, maximum-subarray,
// best-time-to-buy-and-sell-stock, container-with-most-water, longest-substring,
// top-k-frequent-elements) get none, per "add only enough".
export const BATCH2_ADDITIONAL_INPUTS: Record<Batch2Slug, string[]> = {
  "two-sum": [],
  "contains-duplicate": [],
  "maximum-subarray": [],
  "product-of-array-except-self": ["2 3 4 5", "1 0 3 4", "3 4", "-1 2 -3", "2 2 2 2"],
  "best-time-to-buy-and-sell-stock": [],
  "container-with-most-water": [],
  "three-sum": ["-2 0 1 1 2", "1 2 3", "0 0 0 0", "-1 0 1", "-4 -1 -1 0 1 2 2"],
  "missing-number": ["0 1 3", "0", "1", "0 1 2", "9 6 4 2 3 5 7 0 1"],
  "valid-anagram": ["listen\nsilent", "rat\ncar", "ab\nabc", "a\na", "\n"],
  "valid-palindrome": [
    "Was it a car or a cat I saw?",
    "race a car",
    "",
    "ab",
    "No lemon, no melon",
  ],
  "valid-parentheses": [")(", "", "]", "((({{{[[[", "()(())"],
  "longest-substring": [],
  "longest-repeating-character-replacement": ["AABABBA\n1", "A\n0", "ABAB\n0", "AAAA\n2", "AB\n5"],
  "reverse-linked-list": ["10 20 30", "42", "", "1 2", "-1 -1 2 3"],
  "linked-list-cycle": ["1 2 3 4\n1", "1\n-1", "1\n0", "\n-1", "1 2 3 4 5 6 7 8\n5"],
  "remove-nth-node-from-end-of-list": [
    "10 20 30 40\n1",
    "5 6 7\n3",
    "9\n1",
    "1 2 3 4 5 6\n1",
    "5 5 5 5\n2",
  ],
  "reorder-list": ["10 20 30 40 50 60", "7", "1 2", "1 2 3 4 5", "3 3 3 3"],
  "merge-intervals": [
    "1 3\n5 7",
    "10 15\n15 20",
    "5 5",
    "5 6\n1 2\n3 4",
    "1 10\n2 3\n4 5\n6 7\n8 9",
  ],
  "insert-interval": [
    "1\n5 7\n1 3",
    "0\n3 5",
    "2\n2 3\n4 5\n1 6",
    "1\n1 2\n2 3",
    "3\n-5 -2\n-1 0\n3 5\n-3 4",
  ],
  "top-k-frequent-elements": [],
};

function parseIntervals(lines: string[]): Array<[number, number]> {
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = parseNumberTokens(line);
      if (parts.length !== 2) {
        throw new Error(`Malformed interval line: '${line}'`);
      }
      return [parts[0]!, parts[1]!] as [number, number];
    });
}

function mergeIntervalsAlgo(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];

  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

function formatIntervals(intervals: Array<[number, number]>): string {
  return intervals.map(([s, e]) => `${s} ${e}`).join("\n");
}

function solveTwoSum(input: string): string {
  const [numsLine = "", targetLine = ""] = input.split("\n");
  const nums = parseNumberTokens(numsLine);
  const target = Number(targetLine.trim());

  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i += 1) {
    const need = target - nums[i]!;
    if (seen.has(need)) {
      return `${seen.get(need)} ${i}`;
    }
    seen.set(nums[i]!, i);
  }
  throw new Error(`two-sum: no valid pair for target=${target} in '${numsLine}'`);
}

function solveContainsDuplicate(input: string): string {
  const nums = parseNumberTokens(input);
  return String(new Set(nums).size !== nums.length);
}

function solveMaximumSubarray(input: string): string {
  const nums = parseNumberTokens(input);
  if (nums.length === 0) {
    throw new Error("maximum-subarray: input array must be non-empty");
  }
  let best = nums[0]!;
  let current = nums[0]!;
  for (let i = 1; i < nums.length; i += 1) {
    current = Math.max(nums[i]!, current + nums[i]!);
    best = Math.max(best, current);
  }
  return String(best);
}

function solveProductExceptSelf(input: string): string {
  const nums = parseNumberTokens(input);
  const n = nums.length;
  const out = new Array<number>(n).fill(1);

  let prefix = 1;
  for (let i = 0; i < n; i += 1) {
    out[i] = prefix;
    prefix *= nums[i]!;
  }

  let suffix = 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    out[i] = out[i]! * suffix;
    suffix *= nums[i]!;
  }

  return out.join(" ");
}

function solveBestTimeToBuySell(input: string): string {
  const prices = parseNumberTokens(input);
  let minPrice = Infinity;
  let bestProfit = 0;
  for (const price of prices) {
    minPrice = Math.min(minPrice, price);
    bestProfit = Math.max(bestProfit, price - minPrice);
  }
  return String(bestProfit);
}

function solveContainerWithMostWater(input: string): string {
  const heights = parseNumberTokens(input);
  let l = 0;
  let r = heights.length - 1;
  let best = 0;
  while (l < r) {
    const area = Math.min(heights[l]!, heights[r]!) * (r - l);
    best = Math.max(best, area);
    if (heights[l]! < heights[r]!) l += 1;
    else r -= 1;
  }
  return String(best);
}

function solveThreeSum(input: string): string {
  const nums = [...parseNumberTokens(input)].sort((a, b) => a - b);
  const triplets: Array<[number, number, number]> = [];

  for (let i = 0; i < nums.length - 2; i += 1) {
    if (i > 0 && nums[i] === nums[i - 1]) continue;
    let l = i + 1;
    let r = nums.length - 1;
    while (l < r) {
      const sum = nums[i]! + nums[l]! + nums[r]!;
      if (sum === 0) {
        triplets.push([nums[i]!, nums[l]!, nums[r]!]);
        l += 1;
        r -= 1;
        while (l < r && nums[l] === nums[l - 1]) l += 1;
        while (l < r && nums[r] === nums[r + 1]) r -= 1;
      } else if (sum < 0) {
        l += 1;
      } else {
        r -= 1;
      }
    }
  }

  triplets.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return triplets.map((t) => t.join(" ")).join("\n");
}

function solveMissingNumber(input: string): string {
  const nums = parseNumberTokens(input);
  const n = nums.length;
  const expected = (n * (n + 1)) / 2;
  const actual = nums.reduce((a, b) => a + b, 0);
  return String(expected - actual);
}

function solveValidAnagram(input: string): string {
  const [s = "", t = ""] = input.split("\n");
  if (s.length !== t.length) return "false";
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of t) {
    const c = counts.get(ch) ?? 0;
    if (c === 0) return "false";
    counts.set(ch, c - 1);
  }
  return "true";
}

function solveValidPalindrome(input: string): string {
  const cleaned = input
    .toLowerCase()
    .split("")
    .filter((ch) => /[a-z0-9]/.test(ch));
  let l = 0;
  let r = cleaned.length - 1;
  while (l < r) {
    if (cleaned[l] !== cleaned[r]) return "false";
    l += 1;
    r -= 1;
  }
  return "true";
}

function solveValidParentheses(input: string): string {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  for (const ch of input) {
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch);
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== pairs[ch]) return "false";
    }
  }
  return String(stack.length === 0);
}

function solveLongestSubstring(input: string): string {
  const s = input;
  const lastSeen = new Map<string, number>();
  let start = 0;
  let best = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    const prev = lastSeen.get(ch);
    if (prev !== undefined && prev >= start) {
      start = prev + 1;
    }
    lastSeen.set(ch, i);
    best = Math.max(best, i - start + 1);
  }
  return String(best);
}

function solveLongestRepeatingCharReplacement(input: string): string {
  const [s = "", kLine = ""] = input.split("\n");
  const k = Number(kLine.trim());
  const counts = new Map<string, number>();
  let start = 0;
  let maxCount = 0;
  let best = 0;

  for (let end = 0; end < s.length; end += 1) {
    const ch = s[end]!;
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
    maxCount = Math.max(maxCount, counts.get(ch)!);

    while (end - start + 1 - maxCount > k) {
      const startCh = s[start]!;
      counts.set(startCh, counts.get(startCh)! - 1);
      start += 1;
    }

    best = Math.max(best, end - start + 1);
  }

  return String(best);
}

function solveReverseLinkedList(input: string): string {
  const values = parseNumberTokens(input);
  return values.slice().reverse().join(" ");
}

function solveLinkedListCycle(input: string): string {
  const [valuesLine = "", posLine = ""] = input.split("\n");
  const values = parseNumberTokens(valuesLine);
  const pos = Number(posLine.trim());

  if (values.length === 0) return "false";
  if (pos !== -1 && (pos < 0 || pos >= values.length)) {
    throw new Error(`linked-list-cycle: invalid cycle position ${pos} for ${values.length} nodes`);
  }

  interface Node {
    next: Node | null;
  }

  const nodes: Node[] = values.map(() => ({ next: null }));
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    nodes[i]!.next = nodes[i + 1]!;
  }
  if (pos !== -1) {
    nodes[nodes.length - 1]!.next = nodes[pos]!;
  }

  let slow: Node | null = nodes[0]!;
  let fast: Node | null = nodes[0]!;
  while (fast && fast.next) {
    slow = slow!.next;
    fast = fast.next.next;
    if (slow === fast) return "true";
  }
  return "false";
}

function solveRemoveNthFromEnd(input: string): string {
  const [valuesLine = "", nLine = ""] = input.split("\n");
  const values = parseNumberTokens(valuesLine);
  const n = Number(nLine.trim());

  if (!Number.isInteger(n) || n < 1 || n > values.length) {
    throw new Error(
      `remove-nth-node-from-end-of-list: n=${n} out of range for ${values.length} nodes`,
    );
  }

  const removeIndex = values.length - n;
  const result = [...values.slice(0, removeIndex), ...values.slice(removeIndex + 1)];
  return result.join(" ");
}

function solveReorderList(input: string): string {
  const values = parseNumberTokens(input);
  const result: number[] = [];
  let l = 0;
  let r = values.length - 1;
  let takeLeft = true;
  while (l <= r) {
    if (takeLeft) {
      result.push(values[l]!);
      l += 1;
    } else {
      result.push(values[r]!);
      r -= 1;
    }
    takeLeft = !takeLeft;
  }
  return result.join(" ");
}

function solveMergeIntervals(input: string): string {
  const intervals = parseIntervals(input.split("\n"));
  return formatIntervals(mergeIntervalsAlgo(intervals));
}

function solveInsertInterval(input: string): string {
  const lines = input.split("\n");
  const n = Number((lines[0] ?? "").trim());
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`insert-interval: malformed count '${lines[0]}'`);
  }
  const existingLines = lines.slice(1, 1 + n);
  const newLine = lines[1 + n];
  if (newLine === undefined) {
    throw new Error("insert-interval: missing new interval line");
  }

  const intervals = [...parseIntervals(existingLines), ...parseIntervals([newLine])];
  return formatIntervals(mergeIntervalsAlgo(intervals));
}

function solveTopKFrequent(input: string): string {
  const [numsLine = "", kLine = ""] = input.split("\n");
  const nums = parseNumberTokens(numsLine);
  const k = Number(kLine.trim());

  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);

  const entries = [...counts.entries()];
  if (!Number.isInteger(k) || k < 1 || k > entries.length) {
    throw new Error(
      `top-k-frequent-elements: k=${k} out of range for ${entries.length} distinct values`,
    );
  }

  entries.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return entries
    .slice(0, k)
    .map(([value]) => value)
    .join(" ");
}

const ORACLE_BY_SLUG: Record<Batch2Slug, (input: string) => string> = {
  "two-sum": solveTwoSum,
  "contains-duplicate": solveContainsDuplicate,
  "maximum-subarray": solveMaximumSubarray,
  "product-of-array-except-self": solveProductExceptSelf,
  "best-time-to-buy-and-sell-stock": solveBestTimeToBuySell,
  "container-with-most-water": solveContainerWithMostWater,
  "three-sum": solveThreeSum,
  "missing-number": solveMissingNumber,
  "valid-anagram": solveValidAnagram,
  "valid-palindrome": solveValidPalindrome,
  "valid-parentheses": solveValidParentheses,
  "longest-substring": solveLongestSubstring,
  "longest-repeating-character-replacement": solveLongestRepeatingCharReplacement,
  "reverse-linked-list": solveReverseLinkedList,
  "linked-list-cycle": solveLinkedListCycle,
  "remove-nth-node-from-end-of-list": solveRemoveNthFromEnd,
  "reorder-list": solveReorderList,
  "merge-intervals": solveMergeIntervals,
  "insert-interval": solveInsertInterval,
  "top-k-frequent-elements": solveTopKFrequent,
};

export function computeBatch2ExpectedOutput(slug: string, input: string): string {
  if (!(slug in ORACLE_BY_SLUG)) {
    throw new Error(`No Batch 2 oracle registered for slug '${slug}'`);
  }
  return ORACLE_BY_SLUG[slug as Batch2Slug](input);
}

export function computeBatch2AdditionalTests(slug: string): SeedTestInput[] {
  if (!(slug in BATCH2_ADDITIONAL_INPUTS)) return [];
  const inputs = BATCH2_ADDITIONAL_INPUTS[slug as Batch2Slug];
  return inputs.map((input) => ({
    input,
    expectedOutput: computeBatch2ExpectedOutput(slug, input),
  }));
}
