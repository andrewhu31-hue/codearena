import {
  parseNumberTokens,
  parseLevelOrderTree,
  tokenize,
  type TreeNode,
} from "./problemOracles.js";
import type { SeedTestInput } from "./problemOracles.js";

export const BATCH4_SLUGS = [
  "add-and-search-word-data-structure-design",
  "alien-dictionary",
  "binary-tree-level-order-traversal",
  "binary-tree-maximum-path-sum",
  "clone-graph",
  "combination-sum",
  "construct-binary-tree-from-preorder-and-inorder-traversal",
  "counting-bits",
  "course-schedule",
  "encode-and-decode-strings",
  "fizz-buzz",
  "graph-valid-tree",
  "implement-trie-prefix-tree",
  "invert-binary-tree",
  "longest-common-subsequence",
  "lowest-common-ancestor-of-a-binary-search-tree",
  "merge-k-sorted-lists",
  "minimum-window-substring",
  "non-overlapping-intervals",
  "number-of-connected-components-in-an-undirected-graph",
  "number-of-islands",
  "pacific-atlantic-water-flow",
  "rotate-image",
  "serialize-and-deserialize-binary-tree",
  "set-matrix-zeroes",
] as const;

export type Batch4Slug = (typeof BATCH4_SLUGS)[number];

/**
 * Unique (input, expectedOutput) pair count already present in
 * codearena_restored for each slug, as measured before Batch 4 (2026-08-26).
 * Used only as a static baseline for the local oracle test's reachability
 * check; the sync script re-measures the live count and is authoritative.
 */
export const BATCH4_BASELINE_UNIQUE_COUNT: Record<Batch4Slug, number> = {
  "add-and-search-word-data-structure-design": 2,
  "alien-dictionary": 2,
  "binary-tree-level-order-traversal": 4,
  "binary-tree-maximum-path-sum": 2,
  "clone-graph": 2,
  "combination-sum": 4,
  "construct-binary-tree-from-preorder-and-inorder-traversal": 4,
  "counting-bits": 4,
  "course-schedule": 4,
  "encode-and-decode-strings": 2,
  "fizz-buzz": 4,
  "graph-valid-tree": 4,
  "implement-trie-prefix-tree": 2,
  "invert-binary-tree": 4,
  "longest-common-subsequence": 2,
  "lowest-common-ancestor-of-a-binary-search-tree": 2,
  "merge-k-sorted-lists": 2,
  "minimum-window-substring": 4,
  "non-overlapping-intervals": 10,
  "number-of-connected-components-in-an-undirected-graph": 4,
  "number-of-islands": 4,
  "pacific-atlantic-water-flow": 4,
  "rotate-image": 4,
  "serialize-and-deserialize-binary-tree": 2,
  "set-matrix-zeroes": 4,
};

export const BATCH4_ADDITIONAL_INPUTS: Record<Batch4Slug, string[]> = {
  "add-and-search-word-data-structure-design": [
    "addWord a\naddWord b\nsearch .\nsearch a\nsearch c",
    "addWord a\nsearch a",
    "search a",
    "addWord dog\naddWord dog\nsearch dog",
    "addWord bat\naddWord rat\naddWord cat\nsearch .at\nsearch b.t\nsearch ...",
  ],
  "alien-dictionary": ["ba ab", "z x", "a b a", "abc ab", "a b c d e"],
  "binary-tree-level-order-traversal": [
    "1 2 null 3 null 4 null",
    "5",
    "",
    "1 2 3",
    "1 2 3 null 4 5 null",
  ],
  "binary-tree-maximum-path-sum": ["1 -2 3", "-3", "-1 -2 null", "1 1 1 1 1 1 1", "2 -1"],
  "clone-graph": [
    "1: 2 3\n2: 1 3\n3: 1 2",
    "1:\n2:",
    "1: 2\n2: 1\n3: 4\n4: 3",
    "1: 2\n2: 1 3\n3: 2",
    "1: 2 3 4\n2: 1\n3: 1\n4: 1",
  ],
  "combination-sum": ["2 3 5\n8", "5\n3", "3\n9", "4\n4", "1 2 3\n4"],
  "construct-binary-tree-from-preorder-and-inorder-traversal": [
    "3 2 1\n1 2 3",
    "5\n5",
    "1 2 3\n1 2 3",
    "1 2\n2 1",
    "1 2 4 5 3 6 7\n4 2 5 1 6 3 7",
  ],
  "counting-bits": ["5", "0", "1", "10", "8"],
  "course-schedule": ["4\n3\n1 0\n2 0\n3 1", "1\n0", "3\n0", "2\n1\n0 0", "3\n3\n0 1\n1 2\n2 0"],
  "encode-and-decode-strings": ["hello|world", "onlyone", "a||b", "|", "a|bb|ccc|dddd|eeeee"],
  "fizz-buzz": ["1", "3", "15", "20", "2"],
  "graph-valid-tree": [
    "4 3\n0 1\n1 2\n2 3",
    "1 0",
    "4 2\n0 1\n2 3",
    "3 3\n0 1\n1 2\n2 0",
    "5 4\n0 1\n0 2\n0 3\n0 4",
  ],
  "implement-trie-prefix-tree": [
    "insert apple\nsearch apple\nsearch app\nstartsWith app",
    "insert a\nsearch a",
    "search x",
    "insert cat\ninsert cat\nsearch cat",
    "insert car\ninsert card\ninsert care\nsearch car\nsearch ca\nstartsWith ca\nstartsWith care",
  ],
  "invert-binary-tree": ["1 2 null", "1", "", "1 1 1", "1 2 3 4 5 6 7"],
  "longest-common-subsequence": ["AGGTAB\nGXTXAYB", "a\nb", "abc\nxyz", "hello\nhello", "\nabc"],
  "lowest-common-ancestor-of-a-binary-search-tree": [
    "6 2 8 0 4 7 9 null null 3 5\n0 5",
    "5\n5 5",
    "6 2 8 0 4 7 9 null null 3 5\n2 3",
    "5 3 null 1 null null null\n1 3",
    "10 5 15 3 7 12 18\n3 7",
  ],
  "merge-k-sorted-lists": ["1 3\n2 4", "5", "|1 2", "|", "-1 -1 0|2 2|1"],
  "minimum-window-substring": ["a\na", "a\nb", "aa\naa", "ab\nb", "bba\nab"],
  "non-overlapping-intervals": [],
  "number-of-connected-components-in-an-undirected-graph": [
    "5 3\n0 1\n1 2\n3 4",
    "1 0",
    "4 0",
    "4 4\n0 1\n1 2\n2 3\n3 0",
    "6 3\n0 1\n2 3\n4 5",
  ],
  "number-of-islands": [
    "3 3\n1 1 0\n1 1 0\n0 0 1",
    "1 1\n1",
    "1 1\n0",
    "2 2\n1 1\n1 1",
    "3 3\n1 0 1\n0 1 0\n1 0 1",
  ],
  "pacific-atlantic-water-flow": [
    "1 1\n5",
    "2 2\n1 1\n1 1",
    "2 3\n3 3 3\n3 3 3",
    "1 3\n1 2 3",
    "3 1\n1\n2\n3",
  ],
  "rotate-image": [
    "1\n5",
    "2\n1 2\n3 4",
    "2\n1 1\n1 1",
    "2\n-1 -2\n-3 -4",
    "4\n1 2 3 4\n5 6 7 8\n9 10 11 12\n13 14 15 16",
  ],
  "serialize-and-deserialize-binary-tree": [
    "1 2 null",
    "1",
    "0 -1 1",
    "1 null 2 null 3",
    "1 2 3 4 null null null",
  ],
  "set-matrix-zeroes": [
    "3 4\n0 1 2 0\n3 4 5 2\n1 3 1 5",
    "1 1\n0",
    "1 1\n5",
    "2 2\n1 2\n3 4",
    "2 2\n0 0\n0 0",
  ],
};

function serializeLevelOrderTree(root: TreeNode | null): string {
  if (root == null) return "";

  const tokens: string[] = [String(root.val)];
  const queue: TreeNode[] = [root];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.left) {
      tokens.push(String(node.left.val));
      queue.push(node.left);
    } else {
      tokens.push("null");
    }
    if (node.right) {
      tokens.push(String(node.right.val));
      queue.push(node.right);
    } else {
      tokens.push("null");
    }
  }

  let end = tokens.length;
  while (end > 0 && tokens[end - 1] === "null") end -= 1;
  return tokens.slice(0, end).join(" ");
}

function solveAddAndSearchWord(input: string): string {
  const words: string[] = [];
  const outputs: string[] = [];

  const matches = (word: string, pattern: string): boolean => {
    if (word.length !== pattern.length) return false;
    for (let i = 0; i < pattern.length; i += 1) {
      if (pattern[i] !== "." && pattern[i] !== word[i]) return false;
    }
    return true;
  };

  for (const line of input.split("\n")) {
    if (line.trim().length === 0) continue;
    const spaceIdx = line.indexOf(" ");
    const op = line.slice(0, spaceIdx);
    const value = line.slice(spaceIdx + 1);
    if (op === "addWord") {
      words.push(value);
    } else if (op === "search") {
      outputs.push(String(words.some((w) => matches(w, value))));
    }
  }

  return outputs.join("\n");
}

function solveAlienDictionary(input: string): string {
  const words = tokenize(input);
  const letters = new Set<string>();
  for (const w of words) for (const ch of w) letters.add(ch);

  const graph = new Map<string, Set<string>>();
  for (const ch of letters) graph.set(ch, new Set());
  const indegree = new Map<string, number>();
  for (const ch of letters) indegree.set(ch, 0);

  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i]!;
    const b = words[i + 1]!;
    const minLen = Math.min(a.length, b.length);
    let foundDiff = false;
    for (let j = 0; j < minLen; j += 1) {
      if (a[j] !== b[j]) {
        const neighbors = graph.get(a[j]!)!;
        if (!neighbors.has(b[j]!)) {
          neighbors.add(b[j]!);
          indegree.set(b[j]!, indegree.get(b[j]!)! + 1);
        }
        foundDiff = true;
        break;
      }
    }
    if (!foundDiff && a.length > b.length) {
      return "";
    }
  }

  const queue: string[] = [...letters].filter((ch) => indegree.get(ch) === 0).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const ch = queue.shift()!;
    order.push(ch);
    const nextReady: string[] = [];
    for (const next of graph.get(ch)!) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) nextReady.push(next);
    }
    queue.push(...nextReady.sort());
    queue.sort();
  }

  if (order.length !== letters.size) return "";
  return order.join("");
}

function solveBinaryTreeLevelOrderTraversal(input: string): string {
  const root = parseLevelOrderTree(input);
  if (!root) return "";

  const levels: string[] = [];
  let queue: TreeNode[] = [root];
  while (queue.length > 0) {
    levels.push(queue.map((n) => n.val).join(" "));
    const next: TreeNode[] = [];
    for (const node of queue) {
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    queue = next;
  }
  return levels.join("\n");
}

function solveBinaryTreeMaximumPathSum(input: string): string {
  const root = parseLevelOrderTree(input);
  if (!root) throw new Error("binary-tree-maximum-path-sum: tree must be non-empty");

  let best = -Infinity;
  const dfs = (node: TreeNode | null): number => {
    if (!node) return 0;
    const left = Math.max(dfs(node.left), 0);
    const right = Math.max(dfs(node.right), 0);
    best = Math.max(best, node.val + left + right);
    return node.val + Math.max(left, right);
  };
  dfs(root);
  return String(best);
}

function parseCloneGraph(input: string): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  for (const line of input.split("\n")) {
    if (line.trim().length === 0) continue;
    const [labelPart, neighborsPart = ""] = line.split(":");
    const label = Number(labelPart!.trim());
    if (!adjacency.has(label)) adjacency.set(label, new Set());
    for (const n of parseNumberTokens(neighborsPart)) {
      adjacency.get(label)!.add(n);
    }
  }
  return adjacency;
}

function solveCloneGraph(input: string): string {
  const adjacency = parseCloneGraph(input);
  const labels = [...adjacency.keys()].sort((a, b) => a - b);
  const lines = labels.map((label) => {
    const neighbors = [...adjacency.get(label)!].sort((a, b) => a - b);
    return `${label}: ${neighbors.join(" ")}`.trimEnd();
  });
  return lines.join("\n");
}

function solveCombinationSum(input: string): string {
  const [candLine = "", targetLine = ""] = input.split("\n");
  const candidates = [...new Set(parseNumberTokens(candLine))].sort((a, b) => a - b);
  const target = Number(targetLine.trim());

  const results: number[][] = [];
  const current: number[] = [];

  const backtrack = (start: number, remaining: number) => {
    if (remaining === 0) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < candidates.length; i += 1) {
      const c = candidates[i]!;
      if (c > remaining) break;
      current.push(c);
      backtrack(i, remaining - c);
      current.pop();
    }
  };

  backtrack(0, target);
  results.sort((a, b) => {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      if (a[i] !== b[i]) return a[i]! - b[i]!;
    }
    return a.length - b.length;
  });

  return results.map((r) => r.join(" ")).join("\n");
}

function solveConstructBinaryTree(input: string): string {
  const [preorderLine = "", inorderLine = ""] = input.split("\n");
  const preorder = parseNumberTokens(preorderLine);
  const inorder = parseNumberTokens(inorderLine);
  if (preorder.length !== inorder.length) {
    throw new Error(
      "construct-binary-tree-from-preorder-and-inorder-traversal: preorder and inorder must have equal length",
    );
  }
  const inorderIndex = new Map<number, number>();
  inorder.forEach((v, i) => inorderIndex.set(v, i));

  let preIdx = 0;
  const build = (inLo: number, inHi: number): TreeNode | null => {
    if (inLo > inHi) return null;
    const rootVal = preorder[preIdx++]!;
    const node: TreeNode = { val: rootVal, left: null, right: null };
    const mid = inorderIndex.get(rootVal)!;
    node.left = build(inLo, mid - 1);
    node.right = build(mid + 1, inHi);
    return node;
  };

  const root = build(0, inorder.length - 1);
  return serializeLevelOrderTree(root);
}

function solveCountingBits(input: string): string {
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`counting-bits: n must be a non-negative integer, got '${input}'`);
  }
  const result: number[] = [0];
  for (let i = 1; i <= n; i += 1) {
    result.push(result[i >> 1]! + (i & 1));
  }
  return result.join(" ");
}

function solveCourseSchedule(input: string): string {
  const lines = input.split("\n");
  const n = Number((lines[0] ?? "").trim());
  const m = Number((lines[1] ?? "").trim());
  if (!Number.isInteger(n) || n < 0 || !Number.isInteger(m) || m < 0) {
    throw new Error(`course-schedule: malformed header '${lines[0]}' / '${lines[1]}'`);
  }

  const graph: number[][] = Array.from({ length: n }, () => []);
  const indegree = new Array<number>(n).fill(0);
  for (let i = 0; i < m; i += 1) {
    const parts = parseNumberTokens(lines[2 + i] ?? "");
    if (parts.length !== 2) throw new Error(`course-schedule: malformed edge '${lines[2 + i]}'`);
    const [a, b] = parts;
    graph[b!]!.push(a!);
    indegree[a!] = indegree[a!]! + 1;
  }

  const queue: number[] = [];
  for (let i = 0; i < n; i += 1) if (indegree[i] === 0) queue.push(i);
  let visited = 0;
  while (queue.length > 0) {
    const course = queue.shift()!;
    visited += 1;
    for (const next of graph[course]!) {
      indegree[next] = indegree[next]! - 1;
      if (indegree[next] === 0) queue.push(next);
    }
  }

  return String(visited === n);
}

function solveEncodeAndDecodeStrings(input: string): string {
  return input;
}

function solveFizzBuzz(input: string): string {
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`fizz-buzz: n must be a positive integer, got '${input}'`);
  }
  const lines: string[] = [];
  for (let i = 1; i <= n; i += 1) {
    if (i % 15 === 0) lines.push("FizzBuzz");
    else if (i % 3 === 0) lines.push("Fizz");
    else if (i % 5 === 0) lines.push("Buzz");
    else lines.push(String(i));
  }
  return lines.join("\n");
}

function solveGraphValidTree(input: string): string {
  const lines = input.split("\n");
  const [n, m] = parseNumberTokens(lines[0] ?? "");
  if (!Number.isInteger(n) || n! < 1 || !Number.isInteger(m) || m! < 0) {
    throw new Error(`graph-valid-tree: malformed header '${lines[0]}'`);
  }
  if (m !== n! - 1) return "false";

  const parent = Array.from({ length: n! }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };

  for (let i = 0; i < m!; i += 1) {
    const parts = parseNumberTokens(lines[1 + i] ?? "");
    if (parts.length !== 2) throw new Error(`graph-valid-tree: malformed edge '${lines[1 + i]}'`);
    const [u, v] = parts;
    const ru = find(u!);
    const rv = find(v!);
    if (ru === rv) return "false";
    parent[ru] = rv;
  }

  return "true";
}

class TrieNode {
  children = new Map<string, TrieNode>();
  isWord = false;
}

function solveImplementTrie(input: string): string {
  const root = new TrieNode();
  const outputs: string[] = [];

  for (const line of input.split("\n")) {
    if (line.trim().length === 0) continue;
    const spaceIdx = line.indexOf(" ");
    const op = line.slice(0, spaceIdx);
    const word = line.slice(spaceIdx + 1);

    if (op === "insert") {
      let node = root;
      for (const ch of word) {
        if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
        node = node.children.get(ch)!;
      }
      node.isWord = true;
    } else {
      let node: TrieNode | undefined = root;
      for (const ch of word) {
        node = node.children.get(ch);
        if (!node) break;
      }
      if (op === "search") outputs.push(String(node !== undefined && node.isWord));
      else if (op === "startsWith") outputs.push(String(node !== undefined));
    }
  }

  return outputs.join("\n");
}

function solveInvertBinaryTree(input: string): string {
  const root = parseLevelOrderTree(input);
  const invert = (node: TreeNode | null): TreeNode | null => {
    if (!node) return null;
    const left = invert(node.left);
    const right = invert(node.right);
    node.left = right;
    node.right = left;
    return node;
  };
  return serializeLevelOrderTree(invert(root));
}

function solveLongestCommonSubsequence(input: string): string {
  const [a = "", b = ""] = input.split("\n");
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return String(dp[a.length]![b.length]);
}

function solveLowestCommonAncestorBST(input: string): string {
  const [treeLine = "", pqLine = ""] = input.split("\n");
  const root = parseLevelOrderTree(treeLine);
  const [p, q] = parseNumberTokens(pqLine);
  if (!root || p === undefined || q === undefined) {
    throw new Error("lowest-common-ancestor-of-a-binary-search-tree: malformed input");
  }

  let node: TreeNode | null = root;
  while (node) {
    if (p < node.val && q < node.val) node = node.left;
    else if (p > node.val && q > node.val) node = node.right;
    else return String(node.val);
  }
  throw new Error("lowest-common-ancestor-of-a-binary-search-tree: nodes not found");
}

function solveMergeKSortedLists(input: string): string {
  const groups = input.split("|");
  const all: number[] = [];
  for (const g of groups) all.push(...parseNumberTokens(g));
  all.sort((a, b) => a - b);
  return all.join(" ");
}

function solveMinimumWindowSubstring(input: string): string {
  const [s = "", t = ""] = input.split("\n");
  if (t.length === 0) return "";

  const need = new Map<string, number>();
  for (const ch of t) need.set(ch, (need.get(ch) ?? 0) + 1);
  const required = need.size;

  const windowCounts = new Map<string, number>();
  let formed = 0;
  let left = 0;
  let bestLen = Infinity;
  let bestStart = 0;

  for (let right = 0; right < s.length; right += 1) {
    const ch = s[right]!;
    windowCounts.set(ch, (windowCounts.get(ch) ?? 0) + 1);
    if (need.has(ch) && windowCounts.get(ch) === need.get(ch)) formed += 1;

    while (formed === required) {
      if (right - left + 1 < bestLen) {
        bestLen = right - left + 1;
        bestStart = left;
      }
      const leftCh = s[left]!;
      windowCounts.set(leftCh, windowCounts.get(leftCh)! - 1);
      if (need.has(leftCh) && windowCounts.get(leftCh)! < need.get(leftCh)!) formed -= 1;
      left += 1;
    }
  }

  return bestLen === Infinity ? "" : s.slice(bestStart, bestStart + bestLen);
}

function solveNonOverlappingIntervals(input: string): string {
  const lines = input.split("\n");
  const n = Number((lines[0] ?? "").trim());
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const parts = parseNumberTokens(lines[1 + i] ?? "");
    intervals.push([parts[0]!, parts[1]!]);
  }
  intervals.sort((a, b) => a[1] - b[1]);

  let removals = 0;
  let lastEnd = -Infinity;
  for (const [start, end] of intervals) {
    if (start < lastEnd) removals += 1;
    else lastEnd = end;
  }
  return String(removals);
}

function solveNumberOfConnectedComponents(input: string): string {
  const lines = input.split("\n");
  const [n, m] = parseNumberTokens(lines[0] ?? "");
  const parent = Array.from({ length: n! }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (let i = 0; i < m!; i += 1) {
    const [u, v] = parseNumberTokens(lines[1 + i] ?? "");
    const ru = find(u!);
    const rv = find(v!);
    if (ru !== rv) parent[ru] = rv;
  }
  const roots = new Set<number>();
  for (let i = 0; i < n!; i += 1) roots.add(find(i));
  return String(roots.size);
}

function solveNumberOfIslands(input: string): string {
  const lines = input.split("\n");
  const [rows, cols] = parseNumberTokens(lines[0] ?? "");
  const grid = Array.from({ length: rows! }, (_, r) => parseNumberTokens(lines[1 + r] ?? ""));
  const seen = Array.from({ length: rows! }, () => new Array<boolean>(cols!).fill(false));

  const flood = (r: number, c: number) => {
    const stack: Array<[number, number]> = [[r, c]];
    while (stack.length > 0) {
      const [cr, cc] = stack.pop()!;
      if (cr < 0 || cr >= rows! || cc < 0 || cc >= cols!) continue;
      if (seen[cr]![cc] || grid[cr]![cc] !== 1) continue;
      seen[cr]![cc] = true;
      stack.push([cr + 1, cc], [cr - 1, cc], [cr, cc + 1], [cr, cc - 1]);
    }
  };

  let count = 0;
  for (let r = 0; r < rows!; r += 1) {
    for (let c = 0; c < cols!; c += 1) {
      if (grid[r]![c] === 1 && !seen[r]![c]) {
        count += 1;
        flood(r, c);
      }
    }
  }
  return String(count);
}

function solvePacificAtlanticWaterFlow(input: string): string {
  const lines = input.split("\n");
  const [rows, cols] = parseNumberTokens(lines[0] ?? "");
  const grid = Array.from({ length: rows! }, (_, r) => parseNumberTokens(lines[1 + r] ?? ""));

  const bfsFrom = (starts: Array<[number, number]>): boolean[][] => {
    const reachable = Array.from({ length: rows! }, () => new Array<boolean>(cols!).fill(false));
    const queue: Array<[number, number]> = [];
    for (const [r, c] of starts) {
      if (!reachable[r]![c]) {
        reachable[r]![c] = true;
        queue.push([r, c]);
      }
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows! || nc < 0 || nc >= cols!) continue;
        if (reachable[nr]![nc]) continue;
        if (grid[nr]![nc]! < grid[r]![c]!) continue;
        reachable[nr]![nc] = true;
        queue.push([nr, nc]);
      }
    }
    return reachable;
  };

  const pacificStarts: Array<[number, number]> = [];
  const atlanticStarts: Array<[number, number]> = [];
  for (let r = 0; r < rows!; r += 1) {
    pacificStarts.push([r, 0]);
    atlanticStarts.push([r, cols! - 1]);
  }
  for (let c = 0; c < cols!; c += 1) {
    pacificStarts.push([0, c]);
    atlanticStarts.push([rows! - 1, c]);
  }

  const pacific = bfsFrom(pacificStarts);
  const atlantic = bfsFrom(atlanticStarts);

  const result: string[] = [];
  for (let r = 0; r < rows!; r += 1) {
    for (let c = 0; c < cols!; c += 1) {
      if (pacific[r]![c] && atlantic[r]![c]) result.push(`${r} ${c}`);
    }
  }
  return result.join("\n");
}

function solveRotateImage(input: string): string {
  const lines = input.split("\n");
  const n = Number((lines[0] ?? "").trim());
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`rotate-image: malformed size '${lines[0]}'`);
  }
  const grid = Array.from({ length: n }, (_, r) => parseNumberTokens(lines[1 + r] ?? ""));

  const rotated = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      rotated[c]![n - 1 - r] = grid[r]![c]!;
    }
  }

  return rotated.map((row) => row.join(" ")).join("\n");
}

function solveSerializeDeserializeBinaryTree(input: string): string {
  const root = parseLevelOrderTree(input);
  return serializeLevelOrderTree(root);
}

function solveSetMatrixZeroes(input: string): string {
  const lines = input.split("\n");
  const [rows, cols] = parseNumberTokens(lines[0] ?? "");
  const grid = Array.from({ length: rows! }, (_, r) => parseNumberTokens(lines[1 + r] ?? ""));

  const zeroRows = new Set<number>();
  const zeroCols = new Set<number>();
  for (let r = 0; r < rows!; r += 1) {
    for (let c = 0; c < cols!; c += 1) {
      if (grid[r]![c] === 0) {
        zeroRows.add(r);
        zeroCols.add(c);
      }
    }
  }

  for (let r = 0; r < rows!; r += 1) {
    for (let c = 0; c < cols!; c += 1) {
      if (zeroRows.has(r) || zeroCols.has(c)) grid[r]![c] = 0;
    }
  }

  return grid.map((row) => row.join(" ")).join("\n");
}

const ORACLE_BY_SLUG: Record<Batch4Slug, (input: string) => string> = {
  "add-and-search-word-data-structure-design": solveAddAndSearchWord,
  "alien-dictionary": solveAlienDictionary,
  "binary-tree-level-order-traversal": solveBinaryTreeLevelOrderTraversal,
  "binary-tree-maximum-path-sum": solveBinaryTreeMaximumPathSum,
  "clone-graph": solveCloneGraph,
  "combination-sum": solveCombinationSum,
  "construct-binary-tree-from-preorder-and-inorder-traversal": solveConstructBinaryTree,
  "counting-bits": solveCountingBits,
  "course-schedule": solveCourseSchedule,
  "encode-and-decode-strings": solveEncodeAndDecodeStrings,
  "fizz-buzz": solveFizzBuzz,
  "graph-valid-tree": solveGraphValidTree,
  "implement-trie-prefix-tree": solveImplementTrie,
  "invert-binary-tree": solveInvertBinaryTree,
  "longest-common-subsequence": solveLongestCommonSubsequence,
  "lowest-common-ancestor-of-a-binary-search-tree": solveLowestCommonAncestorBST,
  "merge-k-sorted-lists": solveMergeKSortedLists,
  "minimum-window-substring": solveMinimumWindowSubstring,
  "non-overlapping-intervals": solveNonOverlappingIntervals,
  "number-of-connected-components-in-an-undirected-graph": solveNumberOfConnectedComponents,
  "number-of-islands": solveNumberOfIslands,
  "pacific-atlantic-water-flow": solvePacificAtlanticWaterFlow,
  "rotate-image": solveRotateImage,
  "serialize-and-deserialize-binary-tree": solveSerializeDeserializeBinaryTree,
  "set-matrix-zeroes": solveSetMatrixZeroes,
};

export function computeBatch4ExpectedOutput(slug: string, input: string): string {
  if (!(slug in ORACLE_BY_SLUG)) {
    throw new Error(`No Batch 4 oracle registered for slug '${slug}'`);
  }
  return ORACLE_BY_SLUG[slug as Batch4Slug](input);
}

export function computeBatch4AdditionalTests(slug: string): SeedTestInput[] {
  if (!(slug in BATCH4_ADDITIONAL_INPUTS)) return [];
  const inputs = BATCH4_ADDITIONAL_INPUTS[slug as Batch4Slug];
  return inputs.map((input) => ({
    input,
    expectedOutput: computeBatch4ExpectedOutput(slug, input),
  }));
}
