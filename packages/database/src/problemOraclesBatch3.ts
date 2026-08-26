import { parseNumberTokens } from "./problemOracles.js";
import type { SeedTestInput } from "./problemOracles.js";

export const BATCH3_SLUGS = [
  "climbing-stairs",
  "house-robber",
  "house-robber-ii",
  "jump-game",
  "longest-consecutive-sequence",
  "longest-increasing-subsequence",
  "maximum-product-subarray",
  "unique-paths",
  "coin-change",
  "decode-ways",
  "binary-search",
  "find-minimum-in-rotated-sorted-array",
  "search-in-rotated-sorted-array",
  "number-of-1-bits",
  "reverse-bits",
  "sum-of-two-integers",
  "reverse-string",
  "meeting-rooms",
  "meeting-rooms-ii",
  "spiral-matrix",
] as const;

export type Batch3Slug = (typeof BATCH3_SLUGS)[number];

/**
 * Unique (input, expectedOutput) pair count already present in
 * codearena_restored for each slug, as measured before Batch 3 (2026-08-26).
 * Used only as a static baseline for the local oracle test's reachability
 * check; the sync script re-measures the live count and is authoritative.
 */
export const BATCH3_BASELINE_UNIQUE_COUNT: Record<Batch3Slug, number> = {
  "climbing-stairs": 13,
  "house-robber": 10,
  "house-robber-ii": 10,
  "jump-game": 16,
  "longest-consecutive-sequence": 11,
  "longest-increasing-subsequence": 4,
  "maximum-product-subarray": 13,
  "unique-paths": 10,
  "coin-change": 16,
  "decode-ways": 10,
  "binary-search": 17,
  "find-minimum-in-rotated-sorted-array": 10,
  "search-in-rotated-sorted-array": 13,
  "number-of-1-bits": 4,
  "reverse-bits": 4,
  "sum-of-two-integers": 4,
  "reverse-string": 3,
  "meeting-rooms": 4,
  "meeting-rooms-ii": 4,
  "spiral-matrix": 4,
};

// Only slugs below the 7-unique-pair floor get new inputs; slugs already at
// or above it get none, per "add only enough".
export const BATCH3_ADDITIONAL_INPUTS: Record<Batch3Slug, string[]> = {
  "climbing-stairs": [],
  "house-robber": [],
  "house-robber-ii": [],
  "jump-game": [],
  "longest-consecutive-sequence": [],
  "longest-increasing-subsequence": ["4 10 4 3 8 9", "5", "5 4 3 2 1", "7 7 7 7", "1 2 3 4 5 6"],
  "maximum-product-subarray": [],
  "unique-paths": [],
  "coin-change": [],
  "decode-ways": [],
  "binary-search": [],
  "find-minimum-in-rotated-sorted-array": [],
  "search-in-rotated-sorted-array": [],
  "number-of-1-bits": ["0", "4294967295", "1024", "1", "255"],
  "reverse-bits": ["4294967295", "1", "2", "2147483648", "305419896"],
  "sum-of-two-integers": ["0 0", "-5 -7", "10 -3", "1000000 2000000", "-10 3"],
  "reverse-string": ["", "level", "x", "12345", "a b c"],
  "meeting-rooms": ["0", "1\n1 5", "2\n1 5\n5 10", "2\n1 5\n4 10", "3\n1 2\n3 4\n5 6"],
  "meeting-rooms-ii": [
    "0",
    "1\n1 5",
    "3\n1 10\n1 10\n1 10",
    "2\n1 5\n5 10",
    "4\n1 4\n2 5\n3 6\n7 8",
  ],
  "spiral-matrix": [
    "1 4\n1 2 3 4",
    "4 1\n1\n2\n3\n4",
    "1 1\n5",
    "2 4\n1 2 3 4\n5 6 7 8",
    "4 4\n1 2 3 4\n5 6 7 8\n9 10 11 12\n13 14 15 16",
  ],
};

function solveClimbingStairs(input: string): string {
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`climbing-stairs: n must be a positive integer, got '${input}'`);
  }
  let prev = 1;
  let curr = 1;
  for (let i = 2; i <= n; i += 1) {
    [prev, curr] = [curr, prev + curr];
  }
  return String(curr);
}

function robLine(nums: number[]): number {
  let prev = 0;
  let curr = 0;
  for (const n of nums) {
    [prev, curr] = [curr, Math.max(curr, prev + n)];
  }
  return curr;
}

function solveHouseRobber(input: string): string {
  const nums = parseNumberTokens(input);
  if (nums.length === 0) {
    throw new Error("house-robber: input array must be non-empty");
  }
  return String(robLine(nums));
}

function solveHouseRobberII(input: string): string {
  const nums = parseNumberTokens(input);
  if (nums.length === 0) {
    throw new Error("house-robber-ii: input array must be non-empty");
  }
  if (nums.length === 1) return String(nums[0]);
  return String(Math.max(robLine(nums.slice(1)), robLine(nums.slice(0, -1))));
}

function solveJumpGame(input: string): string {
  const nums = parseNumberTokens(input);
  if (nums.length === 0) {
    throw new Error("jump-game: input array must be non-empty");
  }
  let reach = 0;
  for (let i = 0; i < nums.length; i += 1) {
    if (i > reach) return "false";
    reach = Math.max(reach, i + nums[i]!);
  }
  return "true";
}

function solveLongestConsecutiveSequence(input: string): string {
  const nums = new Set(parseNumberTokens(input));
  let best = 0;
  for (const n of nums) {
    if (nums.has(n - 1)) continue;
    let length = 1;
    let current = n;
    while (nums.has(current + 1)) {
      current += 1;
      length += 1;
    }
    best = Math.max(best, length);
  }
  return String(best);
}

function solveLongestIncreasingSubsequence(input: string): string {
  const nums = parseNumberTokens(input);
  const tails: number[] = [];
  for (const n of nums) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < n) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = n;
  }
  return String(tails.length);
}

function solveMaximumProductSubarray(input: string): string {
  const nums = parseNumberTokens(input);
  if (nums.length === 0) {
    throw new Error("maximum-product-subarray: input array must be non-empty");
  }
  let maxProd = nums[0]!;
  let minProd = nums[0]!;
  let best = nums[0]!;
  for (let i = 1; i < nums.length; i += 1) {
    const n = nums[i]!;
    const candidates = [n, maxProd * n, minProd * n];
    maxProd = Math.max(...candidates);
    minProd = Math.min(...candidates);
    best = Math.max(best, maxProd);
  }
  return String(best);
}

function solveUniquePaths(input: string): string {
  const [m, n] = parseNumberTokens(input);
  if (!m || !n || m < 1 || n < 1) {
    throw new Error(`unique-paths: m and n must be positive integers, got '${input}'`);
  }
  const row = new Array<number>(n).fill(1);
  for (let i = 1; i < m; i += 1) {
    for (let j = 1; j < n; j += 1) {
      row[j] = row[j]! + row[j - 1]!;
    }
  }
  return String(row[n - 1]);
}

function solveCoinChange(input: string): string {
  const [coinsLine = "", targetLine = ""] = input.split("\n");
  const coins = parseNumberTokens(coinsLine);
  const target = Number(targetLine.trim());

  const dp = new Array<number>(target + 1).fill(Infinity);
  dp[0] = 0;
  for (let amount = 1; amount <= target; amount += 1) {
    for (const coin of coins) {
      if (coin <= amount && dp[amount - coin]! + 1 < dp[amount]!) {
        dp[amount] = dp[amount - coin]! + 1;
      }
    }
  }
  return String(Number.isFinite(dp[target]) ? dp[target] : -1);
}

function solveDecodeWays(input: string): string {
  const s = input;
  const n = s.length;
  const dp = new Array<number>(n + 1).fill(0);
  dp[0] = 1;
  for (let i = 1; i <= n; i += 1) {
    if (s[i - 1] !== "0") dp[i] = dp[i]! + dp[i - 1]!;
    if (i >= 2) {
      const twoDigit = Number(s.slice(i - 2, i));
      if (s[i - 2] !== "0" && twoDigit >= 10 && twoDigit <= 26) dp[i] = dp[i]! + dp[i - 2]!;
    }
  }
  return String(dp[n]);
}

function solveBinarySearch(input: string): string {
  const [numsLine = "", targetLine = ""] = input.split("\n");
  const nums = parseNumberTokens(numsLine);
  const target = Number(targetLine.trim());

  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return String(mid);
    if (nums[mid]! < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return "-1";
}

function solveFindMinInRotatedSortedArray(input: string): string {
  const nums = parseNumberTokens(input);
  if (nums.length === 0) {
    throw new Error("find-minimum-in-rotated-sorted-array: input array must be non-empty");
  }
  let lo = 0;
  let hi = nums.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid]! > nums[hi]!) lo = mid + 1;
    else hi = mid;
  }
  return String(nums[lo]);
}

function solveSearchInRotatedSortedArray(input: string): string {
  const [numsLine = "", targetLine = ""] = input.split("\n");
  const nums = parseNumberTokens(numsLine);
  const target = Number(targetLine.trim());

  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return String(mid);
    if (nums[lo]! <= nums[mid]!) {
      if (nums[lo]! <= target && target < nums[mid]!) hi = mid - 1;
      else lo = mid + 1;
    } else {
      if (nums[mid]! < target && target <= nums[hi]!) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return "-1";
}

function solveNumberOf1Bits(input: string): string {
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`number-of-1-bits: n must be an unsigned 32-bit integer, got '${input}'`);
  }
  let count = 0;
  let remaining = n;
  while (remaining !== 0) {
    count += remaining & 1;
    remaining = Math.floor(remaining / 2);
  }
  return String(count);
}

function solveReverseBits(input: string): string {
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`reverse-bits: n must be an unsigned 32-bit integer, got '${input}'`);
  }
  let result = 0;
  let value = n;
  for (let i = 0; i < 32; i += 1) {
    result = result * 2 + (value % 2);
    value = Math.floor(value / 2);
  }
  return String(result);
}

function solveSumOfTwoIntegers(input: string): string {
  const parts = parseNumberTokens(input);
  if (parts.length !== 2) {
    throw new Error(`sum-of-two-integers: expected exactly two integers, got '${input}'`);
  }
  return String(parts[0]! + parts[1]!);
}

function solveReverseString(input: string): string {
  return input.split("").reverse().join("");
}

function parseMeetingIntervals(lines: string[]): Array<[number, number]> {
  const n = Number((lines[0] ?? "").trim());
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Malformed meeting count: '${lines[0]}'`);
  }
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const parts = parseNumberTokens(lines[1 + i] ?? "");
    if (parts.length !== 2) {
      throw new Error(`Malformed meeting interval line: '${lines[1 + i]}'`);
    }
    intervals.push([parts[0]!, parts[1]!]);
  }
  return intervals;
}

function solveMeetingRooms(input: string): string {
  const intervals = parseMeetingIntervals(input.split("\n"));
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]![0] < sorted[i - 1]![1]) return "false";
  }
  return "true";
}

function solveMeetingRoomsII(input: string): string {
  const intervals = parseMeetingIntervals(input.split("\n"));
  const starts = intervals.map(([s]) => s).sort((a, b) => a - b);
  const ends = intervals.map(([, e]) => e).sort((a, b) => a - b);

  let rooms = 0;
  let maxRooms = 0;
  let i = 0;
  let j = 0;
  while (i < starts.length) {
    if (starts[i]! < ends[j]!) {
      rooms += 1;
      i += 1;
    } else {
      rooms -= 1;
      j += 1;
    }
    maxRooms = Math.max(maxRooms, rooms);
  }
  return String(maxRooms);
}

function solveSpiralMatrix(input: string): string {
  const lines = input.split("\n");
  const [rows, cols] = parseNumberTokens(lines[0] ?? "");
  if (!rows || !cols || rows < 1 || cols < 1) {
    throw new Error(`spiral-matrix: malformed dimensions '${lines[0]}'`);
  }

  const grid: number[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const rowValues = parseNumberTokens(lines[1 + r] ?? "");
    if (rowValues.length !== cols) {
      throw new Error(`spiral-matrix: row ${r} does not have ${cols} values`);
    }
    grid.push(rowValues);
  }

  const result: number[] = [];
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;

  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c += 1) result.push(grid[top]![c]!);
    top += 1;
    for (let r = top; r <= bottom; r += 1) result.push(grid[r]![right]!);
    right -= 1;
    if (top <= bottom) {
      for (let c = right; c >= left; c -= 1) result.push(grid[bottom]![c]!);
      bottom -= 1;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r -= 1) result.push(grid[r]![left]!);
      left += 1;
    }
  }

  return result.join(" ");
}

const ORACLE_BY_SLUG: Record<Batch3Slug, (input: string) => string> = {
  "climbing-stairs": solveClimbingStairs,
  "house-robber": solveHouseRobber,
  "house-robber-ii": solveHouseRobberII,
  "jump-game": solveJumpGame,
  "longest-consecutive-sequence": solveLongestConsecutiveSequence,
  "longest-increasing-subsequence": solveLongestIncreasingSubsequence,
  "maximum-product-subarray": solveMaximumProductSubarray,
  "unique-paths": solveUniquePaths,
  "coin-change": solveCoinChange,
  "decode-ways": solveDecodeWays,
  "binary-search": solveBinarySearch,
  "find-minimum-in-rotated-sorted-array": solveFindMinInRotatedSortedArray,
  "search-in-rotated-sorted-array": solveSearchInRotatedSortedArray,
  "number-of-1-bits": solveNumberOf1Bits,
  "reverse-bits": solveReverseBits,
  "sum-of-two-integers": solveSumOfTwoIntegers,
  "reverse-string": solveReverseString,
  "meeting-rooms": solveMeetingRooms,
  "meeting-rooms-ii": solveMeetingRoomsII,
  "spiral-matrix": solveSpiralMatrix,
};

export function computeBatch3ExpectedOutput(slug: string, input: string): string {
  if (!(slug in ORACLE_BY_SLUG)) {
    throw new Error(`No Batch 3 oracle registered for slug '${slug}'`);
  }
  return ORACLE_BY_SLUG[slug as Batch3Slug](input);
}

export function computeBatch3AdditionalTests(slug: string): SeedTestInput[] {
  if (!(slug in BATCH3_ADDITIONAL_INPUTS)) return [];
  const inputs = BATCH3_ADDITIONAL_INPUTS[slug as Batch3Slug];
  return inputs.map((input) => ({
    input,
    expectedOutput: computeBatch3ExpectedOutput(slug, input),
  }));
}
