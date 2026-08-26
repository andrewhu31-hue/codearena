/**
 * A C++ type as it appears in the contestant-facing method signature.
 * These describe the *public API* the contestant implements — never a
 * stand-in for how the harness happens to read stdin.
 */
export const CPP_TYPES = [
  "int",
  "bool",
  "void",
  "uint32_t",
  "string",
  "vector<int>",
  "vector<bool>",
  "vector<string>",
  "vector<vector<int>>",
  "vector<vector<string>>",
  "vector<vector<char>>",
  "TreeNode*",
  "ListNode*",
  "Node*",
  "vector<ListNode*>",
] as const;
export type CppType = (typeof CPP_TYPES)[number];

export interface CppParam {
  name: string;
  type: CppType;
}

export interface CppMethodSignature {
  name: string;
  params: CppParam[];
  returnType: CppType;
}

/**
 * The adapter family: a reusable stdin-shape -> method-shape -> stdout-shape
 * mapping. Many unrelated problems share a family; the family plus the
 * method signature is everything the harness generator needs.
 */
export const CPP_FAMILIES = [
  "vecInt_to_int",
  "vecInt_to_bool",
  "vecInt_to_vecInt",
  "vecInt_to_vecvecInt",
  "vecInt_int_to_int",
  "vecInt_target_to_vecInt",
  "vecInt_int_to_vecInt",
  "vecInt_int_to_vecvecInt",
  "int_to_int",
  "int_to_vecInt",
  "int_to_vecString",
  "uint_to_uint",
  "uint_to_int",
  "twoInt_to_int",
  "string_to_string",
  "string_to_int",
  "string_to_bool",
  "twoString_to_bool",
  "twoString_to_int",
  "twoString_to_string",
  "string_int_to_int",
  "string_vecString_to_bool",
  "vecString_to_vecvecString",
  "vecString_to_string",
  "matrix_to_void",
  "matrix_to_vecInt",
  "charMatrix_to_int",
  "matrix_to_vecvecInt",
  "charMatrix_string_to_bool",
  "intervals_to_intervals",
  "intervals_to_bool",
  "intervals_to_int",
  "intervals_interval_to_intervals",
  "graph_to_bool",
  "graph_to_int",
  "tree_to_int",
  "tree_to_bool",
  "tree_to_tree",
  "tree_to_vecvecInt",
  "tree_int_to_int",
  "tree_twoInt_to_int",
  "twoTree_to_bool",
  "twoVecInt_to_tree",
  "list_to_list",
  "list_to_void",
  "list_int_to_list",
  "twoList_to_list",
  "vecList_to_list",
  "listWithCycle_to_bool",
  "graphNode_to_graphNode",
  "codec_vecString_string",
  "codec_tree_string",
  "opseq_trie",
  "opseq_worddict",
] as const;
export type CppFamily = (typeof CPP_FAMILIES)[number];

export interface CppContract {
  slug: string;
  /** Always "Solution" in this platform's convention (see architecture notes). */
  className: "Solution";
  family: CppFamily;
  /** One method for most families; two for codec/operation-sequence families. */
  methods: CppMethodSignature[];
}
