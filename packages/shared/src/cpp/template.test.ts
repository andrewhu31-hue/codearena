import { describe, expect, it } from "vitest";
import { renderCppStarterTemplate } from "./template.js";
import { CPP_CONTRACT_REGISTRY } from "./registry.js";

describe("renderCppStarterTemplate", () => {
  it("reproduces the exact pre-existing two-sum template", () => {
    expect(renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["two-sum"])).toBe(
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        \n    }\n};\n",
    );
  });

  it("reproduces the exact pre-existing binary-search template", () => {
    expect(renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["binary-search"])).toBe(
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int search(vector<int>& nums, int target) {\n        \n    }\n};\n",
    );
  });

  it("reproduces the exact pre-existing reverse-string template", () => {
    expect(renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["reverse-string"])).toBe(
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    string reverseString(string s) {\n        \n    }\n};\n",
    );
  });

  it("reproduces the exact pre-existing fizz-buzz template", () => {
    expect(renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["fizz-buzz"])).toBe(
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<string> fizzBuzz(int n) {\n        \n    }\n};\n",
    );
  });

  it("reproduces the exact pre-existing longest-substring template", () => {
    expect(renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["longest-substring"])).toBe(
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int lengthOfLongestSubstring(string s) {\n        \n    }\n};\n",
    );
  });

  it("reproduces the exact pre-existing merge-intervals template", () => {
    expect(renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["merge-intervals"])).toBe(
      "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<vector<int>> merge(vector<vector<int>>& intervals) {\n        \n    }\n};\n",
    );
  });

  it("uses the user-specified signature for best-time-to-buy-and-sell-stock", () => {
    const rendered = renderCppStarterTemplate(
      CPP_CONTRACT_REGISTRY["best-time-to-buy-and-sell-stock"],
    );
    expect(rendered).toContain("int bestTimeToBuyAndSellStock(vector<int>& nums) {");
  });

  it("includes the TreeNode struct for tree-family contracts", () => {
    const rendered = renderCppStarterTemplate(
      CPP_CONTRACT_REGISTRY["maximum-depth-of-binary-tree"],
    );
    expect(rendered).toContain("struct TreeNode {");
    expect(rendered).toContain("int maxDepth(TreeNode* root) {");
  });

  it("includes the ListNode struct for list-family contracts", () => {
    const rendered = renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["reverse-linked-list"]);
    expect(rendered).toContain("struct ListNode {");
  });

  it("includes the Node class for graph-node contracts", () => {
    const rendered = renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["clone-graph"]);
    expect(rendered).toContain("class Node {");
  });

  it("renders multiple method stubs for operation-sequence contracts, all pass-by-value strings", () => {
    const rendered = renderCppStarterTemplate(CPP_CONTRACT_REGISTRY["implement-trie-prefix-tree"]);
    expect(rendered).toContain("void insert(string word) {");
    expect(rendered).toContain("bool search(string word) {");
    expect(rendered).toContain("bool startsWith(string prefix) {");
  });

  it("renders every one of the 75 contracts without throwing", () => {
    for (const contract of Object.values(CPP_CONTRACT_REGISTRY)) {
      expect(() => renderCppStarterTemplate(contract)).not.toThrow();
    }
  });
});
