/**
 * C++ struct/class definitions shared verbatim between the frontend starter
 * template (what the contestant sees) and the judge-worker harness prelude
 * (what actually gets compiled). Keeping a single copy here means the two
 * can never drift out of sync with each other.
 */

export const TREE_NODE_STRUCT = `struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};`;

export const LIST_NODE_STRUCT = `struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};`;

export const GRAPH_NODE_STRUCT = `class Node {
public:
    int val;
    vector<Node*> neighbors;
    Node() { val = 0; }
    Node(int _val) { val = _val; }
    Node(int _val, vector<Node*> _neighbors) { val = _val; neighbors = _neighbors; }
};`;

export type CppStructName = "TreeNode" | "ListNode" | "Node";

export const STRUCT_TEXT_BY_NAME: Record<CppStructName, string> = {
  TreeNode: TREE_NODE_STRUCT,
  ListNode: LIST_NODE_STRUCT,
  Node: GRAPH_NODE_STRUCT,
};

/**
 * Which struct(s) a contract's method signatures require, in a stable
 * order. Used both to decide what the starter template shows the
 * contestant and what the harness prelude needs — but the harness must
 * only emit a struct that isn't already present in the contestant's own
 * source (which the template already gave them), or the two definitions
 * collide at compile time.
 */
export function requiredStructNames(types: Iterable<string>): CppStructName[] {
  const typeSet = new Set(types);
  const names: CppStructName[] = [];
  if (typeSet.has("TreeNode*")) names.push("TreeNode");
  if (typeSet.has("ListNode*") || typeSet.has("vector<ListNode*>")) names.push("ListNode");
  if (typeSet.has("Node*")) names.push("Node");
  return names;
}
