import type { CppContract, CppMethodSignature } from "./types.js";
import type { CanonicalSlug } from "./manifest.js";

function method(
  name: string,
  params: CppMethodSignature["params"],
  returnType: CppMethodSignature["returnType"],
): CppMethodSignature {
  return { name, params, returnType };
}

/**
 * The single source of truth for every problem's contestant-facing C++
 * class-method contract. Both the frontend starter-template renderer and
 * the judge-worker harness generator import this — never duplicate it.
 *
 * Every signature here is the *real* public API a contestant implements
 * (e.g. `TreeNode*`, `ListNode*`, `Node*` where the problem is genuinely
 * about that data structure) — never a stand-in encoding of how the
 * harness happens to read stdin. See docs in cpp/README (harness modules)
 * for how each family converts between stdin and these types.
 */
export const CPP_CONTRACT_REGISTRY: Record<CanonicalSlug, CppContract> = {
  "two-sum": {
    slug: "two-sum",
    className: "Solution",
    family: "vecInt_target_to_vecInt",
    methods: [
      method(
        "twoSum",
        [
          { name: "nums", type: "vector<int>" },
          { name: "target", type: "int" },
        ],
        "vector<int>",
      ),
    ],
  },
  "binary-search": {
    slug: "binary-search",
    className: "Solution",
    family: "vecInt_int_to_int",
    methods: [
      method(
        "search",
        [
          { name: "nums", type: "vector<int>" },
          { name: "target", type: "int" },
        ],
        "int",
      ),
    ],
  },
  "longest-substring": {
    slug: "longest-substring",
    className: "Solution",
    family: "string_to_int",
    methods: [method("lengthOfLongestSubstring", [{ name: "s", type: "string" }], "int")],
  },
  "reverse-string": {
    slug: "reverse-string",
    className: "Solution",
    family: "string_to_string",
    methods: [method("reverseString", [{ name: "s", type: "string" }], "string")],
  },
  "fizz-buzz": {
    slug: "fizz-buzz",
    className: "Solution",
    family: "int_to_vecString",
    methods: [method("fizzBuzz", [{ name: "n", type: "int" }], "vector<string>")],
  },
  "merge-intervals": {
    slug: "merge-intervals",
    className: "Solution",
    family: "intervals_to_intervals",
    methods: [
      method("merge", [{ name: "intervals", type: "vector<vector<int>>" }], "vector<vector<int>>"),
    ],
  },

  "best-time-to-buy-and-sell-stock": {
    slug: "best-time-to-buy-and-sell-stock",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("bestTimeToBuyAndSellStock", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "maximum-subarray": {
    slug: "maximum-subarray",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("maxSubArray", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "maximum-product-subarray": {
    slug: "maximum-product-subarray",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("maxProduct", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "house-robber": {
    slug: "house-robber",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("rob", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "house-robber-ii": {
    slug: "house-robber-ii",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("rob", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "container-with-most-water": {
    slug: "container-with-most-water",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("maxArea", [{ name: "height", type: "vector<int>" }], "int")],
  },
  "missing-number": {
    slug: "missing-number",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("missingNumber", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "longest-consecutive-sequence": {
    slug: "longest-consecutive-sequence",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("longestConsecutive", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "longest-increasing-subsequence": {
    slug: "longest-increasing-subsequence",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("lengthOfLIS", [{ name: "nums", type: "vector<int>" }], "int")],
  },
  "find-minimum-in-rotated-sorted-array": {
    slug: "find-minimum-in-rotated-sorted-array",
    className: "Solution",
    family: "vecInt_to_int",
    methods: [method("findMin", [{ name: "nums", type: "vector<int>" }], "int")],
  },

  "contains-duplicate": {
    slug: "contains-duplicate",
    className: "Solution",
    family: "vecInt_to_bool",
    methods: [method("containsDuplicate", [{ name: "nums", type: "vector<int>" }], "bool")],
  },
  "jump-game": {
    slug: "jump-game",
    className: "Solution",
    family: "vecInt_to_bool",
    methods: [method("canJump", [{ name: "nums", type: "vector<int>" }], "bool")],
  },

  "product-of-array-except-self": {
    slug: "product-of-array-except-self",
    className: "Solution",
    family: "vecInt_to_vecInt",
    methods: [method("productExceptSelf", [{ name: "nums", type: "vector<int>" }], "vector<int>")],
  },

  "three-sum": {
    slug: "three-sum",
    className: "Solution",
    family: "vecInt_to_vecvecInt",
    methods: [method("threeSum", [{ name: "nums", type: "vector<int>" }], "vector<vector<int>>")],
  },

  "search-in-rotated-sorted-array": {
    slug: "search-in-rotated-sorted-array",
    className: "Solution",
    family: "vecInt_int_to_int",
    methods: [
      method(
        "search",
        [
          { name: "nums", type: "vector<int>" },
          { name: "target", type: "int" },
        ],
        "int",
      ),
    ],
  },
  "coin-change": {
    slug: "coin-change",
    className: "Solution",
    family: "vecInt_int_to_int",
    methods: [
      method(
        "coinChange",
        [
          { name: "coins", type: "vector<int>" },
          { name: "amount", type: "int" },
        ],
        "int",
      ),
    ],
  },

  "top-k-frequent-elements": {
    slug: "top-k-frequent-elements",
    className: "Solution",
    family: "vecInt_int_to_vecInt",
    methods: [
      method(
        "topKFrequent",
        [
          { name: "nums", type: "vector<int>" },
          { name: "k", type: "int" },
        ],
        "vector<int>",
      ),
    ],
  },

  "combination-sum": {
    slug: "combination-sum",
    className: "Solution",
    family: "vecInt_int_to_vecvecInt",
    methods: [
      method(
        "combinationSum",
        [
          { name: "candidates", type: "vector<int>" },
          { name: "target", type: "int" },
        ],
        "vector<vector<int>>",
      ),
    ],
  },

  "climbing-stairs": {
    slug: "climbing-stairs",
    className: "Solution",
    family: "int_to_int",
    methods: [method("climbStairs", [{ name: "n", type: "int" }], "int")],
  },
  "number-of-1-bits": {
    slug: "number-of-1-bits",
    className: "Solution",
    family: "uint_to_int",
    methods: [method("hammingWeight", [{ name: "n", type: "uint32_t" }], "int")],
  },

  "counting-bits": {
    slug: "counting-bits",
    className: "Solution",
    family: "int_to_vecInt",
    methods: [method("countBits", [{ name: "n", type: "int" }], "vector<int>")],
  },

  "reverse-bits": {
    slug: "reverse-bits",
    className: "Solution",
    family: "uint_to_uint",
    methods: [method("reverseBits", [{ name: "n", type: "uint32_t" }], "uint32_t")],
  },

  "sum-of-two-integers": {
    slug: "sum-of-two-integers",
    className: "Solution",
    family: "twoInt_to_int",
    methods: [
      method(
        "getSum",
        [
          { name: "a", type: "int" },
          { name: "b", type: "int" },
        ],
        "int",
      ),
    ],
  },
  "unique-paths": {
    slug: "unique-paths",
    className: "Solution",
    family: "twoInt_to_int",
    methods: [
      method(
        "uniquePaths",
        [
          { name: "m", type: "int" },
          { name: "n", type: "int" },
        ],
        "int",
      ),
    ],
  },

  "decode-ways": {
    slug: "decode-ways",
    className: "Solution",
    family: "string_to_int",
    methods: [method("numDecodings", [{ name: "s", type: "string" }], "int")],
  },
  "palindromic-substrings": {
    slug: "palindromic-substrings",
    className: "Solution",
    family: "string_to_int",
    methods: [method("countSubstrings", [{ name: "s", type: "string" }], "int")],
  },

  "valid-palindrome": {
    slug: "valid-palindrome",
    className: "Solution",
    family: "string_to_bool",
    methods: [method("isPalindrome", [{ name: "s", type: "string" }], "bool")],
  },
  "valid-parentheses": {
    slug: "valid-parentheses",
    className: "Solution",
    family: "string_to_bool",
    methods: [method("isValid", [{ name: "s", type: "string" }], "bool")],
  },

  "valid-anagram": {
    slug: "valid-anagram",
    className: "Solution",
    family: "twoString_to_bool",
    methods: [
      method(
        "isAnagram",
        [
          { name: "s", type: "string" },
          { name: "t", type: "string" },
        ],
        "bool",
      ),
    ],
  },

  "longest-common-subsequence": {
    slug: "longest-common-subsequence",
    className: "Solution",
    family: "twoString_to_int",
    methods: [
      method(
        "longestCommonSubsequence",
        [
          { name: "text1", type: "string" },
          { name: "text2", type: "string" },
        ],
        "int",
      ),
    ],
  },

  "minimum-window-substring": {
    slug: "minimum-window-substring",
    className: "Solution",
    family: "twoString_to_string",
    methods: [
      method(
        "minWindow",
        [
          { name: "s", type: "string" },
          { name: "t", type: "string" },
        ],
        "string",
      ),
    ],
  },

  "longest-repeating-character-replacement": {
    slug: "longest-repeating-character-replacement",
    className: "Solution",
    family: "string_int_to_int",
    methods: [
      method(
        "characterReplacement",
        [
          { name: "s", type: "string" },
          { name: "k", type: "int" },
        ],
        "int",
      ),
    ],
  },

  "word-break": {
    slug: "word-break",
    className: "Solution",
    family: "string_vecString_to_bool",
    methods: [
      method(
        "wordBreak",
        [
          { name: "s", type: "string" },
          { name: "wordDict", type: "vector<string>" },
        ],
        "bool",
      ),
    ],
  },

  "group-anagrams": {
    slug: "group-anagrams",
    className: "Solution",
    family: "vecString_to_vecvecString",
    methods: [
      method("groupAnagrams", [{ name: "strs", type: "vector<string>" }], "vector<vector<string>>"),
    ],
  },

  "alien-dictionary": {
    slug: "alien-dictionary",
    className: "Solution",
    family: "vecString_to_string",
    methods: [method("alienOrder", [{ name: "words", type: "vector<string>" }], "string")],
  },

  "rotate-image": {
    slug: "rotate-image",
    className: "Solution",
    family: "matrix_to_void",
    methods: [method("rotate", [{ name: "matrix", type: "vector<vector<int>>" }], "void")],
  },
  "set-matrix-zeroes": {
    slug: "set-matrix-zeroes",
    className: "Solution",
    family: "matrix_to_void",
    methods: [method("setZeroes", [{ name: "matrix", type: "vector<vector<int>>" }], "void")],
  },

  "spiral-matrix": {
    slug: "spiral-matrix",
    className: "Solution",
    family: "matrix_to_vecInt",
    methods: [
      method("spiralOrder", [{ name: "matrix", type: "vector<vector<int>>" }], "vector<int>"),
    ],
  },

  "number-of-islands": {
    slug: "number-of-islands",
    className: "Solution",
    family: "charMatrix_to_int",
    methods: [method("numIslands", [{ name: "grid", type: "vector<vector<char>>" }], "int")],
  },

  "pacific-atlantic-water-flow": {
    slug: "pacific-atlantic-water-flow",
    className: "Solution",
    family: "matrix_to_vecvecInt",
    methods: [
      method(
        "pacificAtlantic",
        [{ name: "heights", type: "vector<vector<int>>" }],
        "vector<vector<int>>",
      ),
    ],
  },

  "word-search": {
    slug: "word-search",
    className: "Solution",
    family: "charMatrix_string_to_bool",
    methods: [
      method(
        "exist",
        [
          { name: "board", type: "vector<vector<char>>" },
          { name: "word", type: "string" },
        ],
        "bool",
      ),
    ],
  },

  "meeting-rooms": {
    slug: "meeting-rooms",
    className: "Solution",
    family: "intervals_to_bool",
    methods: [
      method("canAttendMeetings", [{ name: "intervals", type: "vector<vector<int>>" }], "bool"),
    ],
  },
  "meeting-rooms-ii": {
    slug: "meeting-rooms-ii",
    className: "Solution",
    family: "intervals_to_int",
    methods: [
      method("minMeetingRooms", [{ name: "intervals", type: "vector<vector<int>>" }], "int"),
    ],
  },
  "non-overlapping-intervals": {
    slug: "non-overlapping-intervals",
    className: "Solution",
    family: "intervals_to_int",
    methods: [
      method("eraseOverlapIntervals", [{ name: "intervals", type: "vector<vector<int>>" }], "int"),
    ],
  },
  "insert-interval": {
    slug: "insert-interval",
    className: "Solution",
    family: "intervals_interval_to_intervals",
    methods: [
      method(
        "insert",
        [
          { name: "intervals", type: "vector<vector<int>>" },
          { name: "newInterval", type: "vector<int>" },
        ],
        "vector<vector<int>>",
      ),
    ],
  },

  "course-schedule": {
    slug: "course-schedule",
    className: "Solution",
    family: "graph_to_bool",
    methods: [
      method(
        "canFinish",
        [
          { name: "numCourses", type: "int" },
          { name: "prerequisites", type: "vector<vector<int>>" },
        ],
        "bool",
      ),
    ],
  },
  "graph-valid-tree": {
    slug: "graph-valid-tree",
    className: "Solution",
    family: "graph_to_bool",
    methods: [
      method(
        "validTree",
        [
          { name: "n", type: "int" },
          { name: "edges", type: "vector<vector<int>>" },
        ],
        "bool",
      ),
    ],
  },
  "number-of-connected-components-in-an-undirected-graph": {
    slug: "number-of-connected-components-in-an-undirected-graph",
    className: "Solution",
    family: "graph_to_int",
    methods: [
      method(
        "countComponents",
        [
          { name: "n", type: "int" },
          { name: "edges", type: "vector<vector<int>>" },
        ],
        "int",
      ),
    ],
  },

  "maximum-depth-of-binary-tree": {
    slug: "maximum-depth-of-binary-tree",
    className: "Solution",
    family: "tree_to_int",
    methods: [method("maxDepth", [{ name: "root", type: "TreeNode*" }], "int")],
  },
  "binary-tree-maximum-path-sum": {
    slug: "binary-tree-maximum-path-sum",
    className: "Solution",
    family: "tree_to_int",
    methods: [method("maxPathSum", [{ name: "root", type: "TreeNode*" }], "int")],
  },
  "validate-binary-search-tree": {
    slug: "validate-binary-search-tree",
    className: "Solution",
    family: "tree_to_bool",
    methods: [method("isValidBST", [{ name: "root", type: "TreeNode*" }], "bool")],
  },
  "invert-binary-tree": {
    slug: "invert-binary-tree",
    className: "Solution",
    family: "tree_to_tree",
    methods: [method("invertTree", [{ name: "root", type: "TreeNode*" }], "TreeNode*")],
  },
  "binary-tree-level-order-traversal": {
    slug: "binary-tree-level-order-traversal",
    className: "Solution",
    family: "tree_to_vecvecInt",
    methods: [method("levelOrder", [{ name: "root", type: "TreeNode*" }], "vector<vector<int>>")],
  },
  "kth-smallest-element-in-a-bst": {
    slug: "kth-smallest-element-in-a-bst",
    className: "Solution",
    family: "tree_int_to_int",
    methods: [
      method(
        "kthSmallest",
        [
          { name: "root", type: "TreeNode*" },
          { name: "k", type: "int" },
        ],
        "int",
      ),
    ],
  },
  "lowest-common-ancestor-of-a-binary-search-tree": {
    slug: "lowest-common-ancestor-of-a-binary-search-tree",
    className: "Solution",
    family: "tree_twoInt_to_int",
    methods: [
      method(
        "lowestCommonAncestor",
        [
          { name: "root", type: "TreeNode*" },
          { name: "p", type: "TreeNode*" },
          { name: "q", type: "TreeNode*" },
        ],
        "TreeNode*",
      ),
    ],
  },
  "same-tree": {
    slug: "same-tree",
    className: "Solution",
    family: "twoTree_to_bool",
    methods: [
      method(
        "isSameTree",
        [
          { name: "p", type: "TreeNode*" },
          { name: "q", type: "TreeNode*" },
        ],
        "bool",
      ),
    ],
  },
  "subtree-of-another-tree": {
    slug: "subtree-of-another-tree",
    className: "Solution",
    family: "twoTree_to_bool",
    methods: [
      method(
        "isSubtree",
        [
          { name: "root", type: "TreeNode*" },
          { name: "subRoot", type: "TreeNode*" },
        ],
        "bool",
      ),
    ],
  },
  "construct-binary-tree-from-preorder-and-inorder-traversal": {
    slug: "construct-binary-tree-from-preorder-and-inorder-traversal",
    className: "Solution",
    family: "twoVecInt_to_tree",
    methods: [
      method(
        "buildTree",
        [
          { name: "preorder", type: "vector<int>" },
          { name: "inorder", type: "vector<int>" },
        ],
        "TreeNode*",
      ),
    ],
  },

  "reverse-linked-list": {
    slug: "reverse-linked-list",
    className: "Solution",
    family: "list_to_list",
    methods: [method("reverseList", [{ name: "head", type: "ListNode*" }], "ListNode*")],
  },
  "reorder-list": {
    slug: "reorder-list",
    className: "Solution",
    family: "list_to_void",
    methods: [method("reorderList", [{ name: "head", type: "ListNode*" }], "void")],
  },
  "remove-nth-node-from-end-of-list": {
    slug: "remove-nth-node-from-end-of-list",
    className: "Solution",
    family: "list_int_to_list",
    methods: [
      method(
        "removeNthFromEnd",
        [
          { name: "head", type: "ListNode*" },
          { name: "n", type: "int" },
        ],
        "ListNode*",
      ),
    ],
  },
  "merge-two-sorted-lists": {
    slug: "merge-two-sorted-lists",
    className: "Solution",
    family: "twoList_to_list",
    methods: [
      method(
        "mergeTwoLists",
        [
          { name: "l1", type: "ListNode*" },
          { name: "l2", type: "ListNode*" },
        ],
        "ListNode*",
      ),
    ],
  },
  "merge-k-sorted-lists": {
    slug: "merge-k-sorted-lists",
    className: "Solution",
    family: "vecList_to_list",
    methods: [method("mergeKLists", [{ name: "lists", type: "vector<ListNode*>" }], "ListNode*")],
  },
  "linked-list-cycle": {
    slug: "linked-list-cycle",
    className: "Solution",
    family: "listWithCycle_to_bool",
    methods: [method("hasCycle", [{ name: "head", type: "ListNode*" }], "bool")],
  },

  "clone-graph": {
    slug: "clone-graph",
    className: "Solution",
    family: "graphNode_to_graphNode",
    methods: [method("cloneGraph", [{ name: "node", type: "Node*" }], "Node*")],
  },

  "encode-and-decode-strings": {
    slug: "encode-and-decode-strings",
    className: "Solution",
    family: "codec_vecString_string",
    methods: [
      method("encode", [{ name: "strs", type: "vector<string>" }], "string"),
      method("decode", [{ name: "s", type: "string" }], "vector<string>"),
    ],
  },
  "serialize-and-deserialize-binary-tree": {
    slug: "serialize-and-deserialize-binary-tree",
    className: "Solution",
    family: "codec_tree_string",
    methods: [
      method("serialize", [{ name: "root", type: "TreeNode*" }], "string"),
      method("deserialize", [{ name: "data", type: "string" }], "TreeNode*"),
    ],
  },

  "implement-trie-prefix-tree": {
    slug: "implement-trie-prefix-tree",
    className: "Solution",
    family: "opseq_trie",
    methods: [
      method("insert", [{ name: "word", type: "string" }], "void"),
      method("search", [{ name: "word", type: "string" }], "bool"),
      method("startsWith", [{ name: "prefix", type: "string" }], "bool"),
    ],
  },
  "add-and-search-word-data-structure-design": {
    slug: "add-and-search-word-data-structure-design",
    className: "Solution",
    family: "opseq_worddict",
    methods: [
      method("addWord", [{ name: "word", type: "string" }], "void"),
      method("search", [{ name: "word", type: "string" }], "bool"),
    ],
  },
};

export function getCppContract(slug: string): CppContract | undefined {
  return CPP_CONTRACT_REGISTRY[slug as CanonicalSlug];
}
