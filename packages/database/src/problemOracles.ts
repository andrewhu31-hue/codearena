export interface SeedTestInput {
  input: string;
  expectedOutput: string;
}

interface TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

export const BATCH1_SIMPLE_SLUGS = [
  "group-anagrams",
  "palindromic-substrings",
  "word-break",
  "word-search",
  "maximum-depth-of-binary-tree",
  "same-tree",
  "validate-binary-search-tree",
  "kth-smallest-element-in-a-bst",
  "merge-two-sorted-lists",
  "subtree-of-another-tree",
] as const;

export type Batch1Slug = (typeof BATCH1_SIMPLE_SLUGS)[number];

export const BATCH1_ADDITIONAL_INPUTS: Record<Batch1Slug, string[]> = {
  "group-anagrams": [
    "abc bca cab foo ofo",
    "a",
    "ab ba abc cba bca",
    "zzz zz z",
    "rat tar art star tars",
  ],
  "palindromic-substrings": ["", "a", "abba", "racecar", "aaaa"],
  "word-break": [
    "applepenapple\napple pen",
    "catsanddog\ncats dog sand and cat",
    "aaaaaaa\na aa aaa",
    "aaaaab\na aa aaa aaaa",
    "pineapplepenapple\napple pen applepen pine pineapple",
  ],
  "word-search": [
    "1 1\nA\nA",
    "1 1\nA\nB",
    "2 2\nA B\nC D\nABCA",
    "2 3\nA B C\nD E F\nABE",
    "3 3\nA A A\nA A A\nA A A\nAAAAA",
  ],
  "maximum-depth-of-binary-tree": [
    "",
    "1",
    "1 2 3 4 5 null null",
    "1 null 2 null 3 null 4",
    "1 2 null 3 null 4 null",
  ],
  "same-tree": ["1\n1", "1 2 3\n1 3 2", "1 null 2 3\n1 null 2 3", "2 1 3\n2 1 4", "1 2\n1 2 3"],
  "validate-binary-search-tree": [
    "1",
    "5 4 6 null null 3 7",
    "10 5 15 2 7 12 20",
    "2 2 2",
    "0 -1 1",
  ],
  "kth-smallest-element-in-a-bst": [
    "2 1 3\n2",
    "1 null 2\n2",
    "5 3 7 2 4 6 8\n5",
    "3 1 4 null 2\n3",
    "10 5 15 3 7 12 18\n7",
  ],
  "merge-two-sorted-lists": ["1 3 5\n2 4 6", "-3 -1 2\n-2 0 3", "1 1 1\n1 1", "\n0 2 4", "5 6\n"],
  "subtree-of-another-tree": [
    "1 1\n1",
    "1 2 3\n2 3",
    "3 4 5 1 2\n4 1",
    "3 4 5 1 2\n5",
    "1 2 3 4 null null null\n2 4",
  ],
};

function tokenize(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/g);
}

function parseNumberTokens(line: string): number[] {
  return tokenize(line).map((t) => Number(t));
}

function parseLevelOrderTree(line: string): TreeNode | null {
  const raw = tokenize(line);
  if (raw.length === 0) return null;
  const values = raw.map((t) => (t === "null" ? null : Number(t)));
  if (values[0] == null) return null;

  const root: TreeNode = { val: values[0], left: null, right: null };
  const queue: TreeNode[] = [root];
  let i = 1;

  while (queue.length > 0 && i < values.length) {
    const node = queue.shift();
    if (!node) break;

    const leftVal = values[i++];
    if (leftVal != null) {
      node.left = { val: leftVal, left: null, right: null };
      queue.push(node.left);
    }

    if (i >= values.length) break;

    const rightVal = values[i++];
    if (rightVal != null) {
      node.right = { val: rightVal, left: null, right: null };
      queue.push(node.right);
    }
  }

  return root;
}

function treeEqual(a: TreeNode | null, b: TreeNode | null): boolean {
  if (a == null || b == null) return a === b;
  return a.val === b.val && treeEqual(a.left, b.left) && treeEqual(a.right, b.right);
}

function solveGroupAnagrams(input: string): string {
  const words = tokenize(input);
  if (words.length === 0) return "";
  const groups = new Map<string, string[]>();

  for (const w of words) {
    const key = w.split("").sort().join("");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(w);
  }

  const normalized = [...groups.values()]
    .map((g) => g.slice().sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0]!.localeCompare(b[0]!));

  return normalized.map((g) => g.join(" ")).join("\n");
}

function solvePalindromicSubstrings(input: string): string {
  const s = input;
  let count = 0;

  const expand = (l0: number, r0: number) => {
    let l = l0;
    let r = r0;
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      count += 1;
      l -= 1;
      r += 1;
    }
  };

  for (let i = 0; i < s.length; i += 1) {
    expand(i, i);
    expand(i, i + 1);
  }

  return String(count);
}

function solveWordBreak(input: string): string {
  const [rawS, rawDict = ""] = input.split("\n");
  const s = rawS ?? "";
  const dict = new Set(tokenize(rawDict));

  const dp = new Array<boolean>(s.length + 1).fill(false);
  dp[0] = true;

  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (!dp[j]) continue;
      if (dict.has(s.slice(j, i))) {
        dp[i] = true;
        break;
      }
    }
  }

  return String(dp[s.length]);
}

function solveWordSearch(input: string): string {
  const lines = input.split("\n");
  if (lines.length < 2) return "false";

  const [rToken, cToken] = tokenize(lines[0] ?? "");
  const rows = Number(rToken ?? 0);
  const cols = Number(cToken ?? 0);
  if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) return "false";
  if (lines.length < rows + 2) return "false";

  const board: string[][] = [];
  for (let i = 0; i < rows; i += 1) {
    const line = lines[i + 1] ?? "";
    const tokens = tokenize(line);
    if (tokens.length === cols) {
      board.push(tokens);
    } else if (line.length === cols) {
      board.push(line.split(""));
    } else {
      return "false";
    }
  }

  const word = lines[rows + 1] ?? "";
  if (word.length === 0) return "true";

  const seen = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  const dfs = (r: number, c: number, idx: number): boolean => {
    if (board[r]?.[c] !== word[idx]) return false;
    if (idx === word.length - 1) return true;

    seen[r]![c] = true;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (seen[nr]![nc]) continue;
      if (dfs(nr, nc, idx + 1)) {
        seen[r]![c] = false;
        return true;
      }
    }
    seen[r]![c] = false;
    return false;
  };

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (dfs(r, c, 0)) return "true";
    }
  }
  return "false";
}

function solveMaximumDepth(input: string): string {
  const root = parseLevelOrderTree(input);
  const depth = (node: TreeNode | null): number => {
    if (!node) return 0;
    return 1 + Math.max(depth(node.left), depth(node.right));
  };
  return String(depth(root));
}

function solveSameTree(input: string): string {
  const [a = "", b = ""] = input.split("\n");
  const ta = parseLevelOrderTree(a);
  const tb = parseLevelOrderTree(b);
  return String(treeEqual(ta, tb));
}

function solveValidateBst(input: string): string {
  const root = parseLevelOrderTree(input);
  const valid = (node: TreeNode | null, min: number, max: number): boolean => {
    if (!node) return true;
    if (!(node.val > min && node.val < max)) return false;
    return valid(node.left, min, node.val) && valid(node.right, node.val, max);
  };
  return String(valid(root, -Infinity, Infinity));
}

function solveKthSmallest(input: string): string {
  const [treeLine = "", kLine = ""] = input.split("\n");
  const k = Number((kLine ?? "").trim());
  const root = parseLevelOrderTree(treeLine);

  const stack: TreeNode[] = [];
  let node: TreeNode | null = root;
  let seen = 0;

  while (stack.length > 0 || node) {
    while (node) {
      stack.push(node);
      node = node.left;
    }
    const cur = stack.pop();
    if (!cur) break;
    seen += 1;
    if (seen === k) return String(cur.val);
    node = cur.right;
  }

  throw new Error(`kth-smallest-element-in-a-bst: invalid k=${k} for input '${input}'`);
}

function solveMergeTwoSortedLists(input: string): string {
  const [aLine = "", bLine = ""] = input.split("\n");
  const a = parseNumberTokens(aLine);
  const b = parseNumberTokens(bLine);
  const out: number[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i]! <= b[j]!) {
      out.push(a[i]!);
      i += 1;
    } else {
      out.push(b[j]!);
      j += 1;
    }
  }
  while (i < a.length) {
    out.push(a[i]!);
    i += 1;
  }
  while (j < b.length) {
    out.push(b[j]!);
    j += 1;
  }

  return out.join(" ");
}

function isSubtree(root: TreeNode | null, sub: TreeNode | null): boolean {
  if (!sub) return true;
  if (!root) return false;
  if (treeEqual(root, sub)) return true;
  return isSubtree(root.left, sub) || isSubtree(root.right, sub);
}

function solveSubtree(input: string): string {
  const [rootLine = "", subLine = ""] = input.split("\n");
  const root = parseLevelOrderTree(rootLine);
  const sub = parseLevelOrderTree(subLine);
  return String(isSubtree(root, sub));
}

const ORACLE_BY_SLUG: Record<Batch1Slug, (input: string) => string> = {
  "group-anagrams": solveGroupAnagrams,
  "palindromic-substrings": solvePalindromicSubstrings,
  "word-break": solveWordBreak,
  "word-search": solveWordSearch,
  "maximum-depth-of-binary-tree": solveMaximumDepth,
  "same-tree": solveSameTree,
  "validate-binary-search-tree": solveValidateBst,
  "kth-smallest-element-in-a-bst": solveKthSmallest,
  "merge-two-sorted-lists": solveMergeTwoSortedLists,
  "subtree-of-another-tree": solveSubtree,
};

export function computeExpectedOutputForSupportedProblem(slug: string, input: string): string {
  if (!(slug in ORACLE_BY_SLUG)) {
    throw new Error(`No oracle registered for slug '${slug}'`);
  }
  return ORACLE_BY_SLUG[slug as Batch1Slug](input);
}

export function computeBatch1AdditionalTests(slug: string): SeedTestInput[] {
  if (!(slug in BATCH1_ADDITIONAL_INPUTS)) return [];
  const inputs = BATCH1_ADDITIONAL_INPUTS[slug as Batch1Slug];
  return inputs.map((input) => ({
    input,
    expectedOutput: computeExpectedOutputForSupportedProblem(slug, input),
  }));
}
