/**
 * C++ source text for every stdout-serialization helper. `printVecInt`,
 * `printVecStringLines`, and `printIntervals` keep their original names/
 * bodies verbatim; every new helper is prefixed `judge_`.
 *
 * Several of these deliberately *normalize* an unordered result the
 * contestant is free to return in any order (LeetCode's own convention for
 * these problems), because the stored expected output is a single fixed
 * canonical string: group-anagrams, three-sum, combination-sum, and
 * pacific-atlantic-water-flow all sort here before printing.
 */
export const SERIALIZER_HELPERS = String.raw`
static void printVecInt(const vector<int>& v) {
  for (size_t i = 0; i < v.size(); i++) {
    if (i) cout << ' ';
    cout << v[i];
  }
}

static void printVecStringLines(const vector<string>& v) {
  for (size_t i = 0; i < v.size(); i++) {
    if (i) cout << '\n';
    cout << v[i];
  }
}

static void printIntervals(const vector<vector<int>>& intervals) {
  for (size_t i = 0; i < intervals.size(); i++) {
    if (i) cout << '\n';
    if (intervals[i].size() >= 2) cout << intervals[i][0] << ' ' << intervals[i][1];
  }
}

static void judge_printBool(bool b) {
  cout << (b ? "true" : "false");
}

static void judge_printMatrixRows(const vector<vector<int>>& grid) {
  for (size_t i = 0; i < grid.size(); i++) {
    if (i) cout << '\n';
    for (size_t j = 0; j < grid[i].size(); j++) {
      if (j) cout << ' ';
      cout << grid[i][j];
    }
  }
}

static void judge_printSortedCoordinates(vector<vector<int>> coords) {
  sort(coords.begin(), coords.end());
  for (size_t i = 0; i < coords.size(); i++) {
    if (i) cout << '\n';
    cout << coords[i][0] << ' ' << coords[i][1];
  }
}

static void judge_printNormalizedGroups(vector<vector<int>> groups) {
  for (auto& g : groups) sort(g.begin(), g.end());
  sort(groups.begin(), groups.end());
  for (size_t i = 0; i < groups.size(); i++) {
    if (i) cout << '\n';
    printVecInt(groups[i]);
  }
}

static void judge_printNormalizedStringGroups(vector<vector<string>> groups) {
  for (auto& g : groups) sort(g.begin(), g.end());
  sort(groups.begin(), groups.end());
  for (size_t i = 0; i < groups.size(); i++) {
    if (i) cout << '\n';
    for (size_t j = 0; j < groups[i].size(); j++) {
      if (j) cout << ' ';
      cout << groups[i][j];
    }
  }
}

static string judge_serializeTree(TreeNode* root) {
  if (root == nullptr) return "";
  vector<string> tokens;
  tokens.push_back(to_string(root->val));
  vector<TreeNode*> queue;
  queue.push_back(root);
  size_t qi = 0;
  while (qi < queue.size()) {
    TreeNode* node = queue[qi++];
    if (node->left) {
      tokens.push_back(to_string(node->left->val));
      queue.push_back(node->left);
    } else {
      tokens.push_back("null");
    }
    if (node->right) {
      tokens.push_back(to_string(node->right->val));
      queue.push_back(node->right);
    } else {
      tokens.push_back("null");
    }
  }
  size_t end = tokens.size();
  while (end > 0 && tokens[end - 1] == "null") end--;
  string out;
  for (size_t i = 0; i < end; i++) {
    if (i) out += ' ';
    out += tokens[i];
  }
  return out;
}

static string judge_serializeList(ListNode* head) {
  string out;
  bool first = true;
  while (head) {
    if (!first) out += ' ';
    out += to_string(head->val);
    first = false;
    head = head->next;
  }
  return out;
}

static string judge_serializeGraphNode(Node* start) {
  if (!start) return "";
  unordered_map<int, Node*> byLabel;
  vector<Node*> stack;
  stack.push_back(start);
  byLabel[start->val] = start;
  while (!stack.empty()) {
    Node* cur = stack.back();
    stack.pop_back();
    for (Node* n : cur->neighbors) {
      if (!byLabel.count(n->val)) {
        byLabel[n->val] = n;
        stack.push_back(n);
      }
    }
  }
  vector<int> labels;
  for (const auto& entry : byLabel) labels.push_back(entry.first);
  sort(labels.begin(), labels.end());
  string out;
  for (size_t i = 0; i < labels.size(); i++) {
    if (i) out += '\n';
    vector<int> neighborLabels;
    for (Node* n : byLabel[labels[i]]->neighbors) neighborLabels.push_back(n->val);
    sort(neighborLabels.begin(), neighborLabels.end());
    out += to_string(labels[i]) + ":";
    for (size_t j = 0; j < neighborLabels.size(); j++) out += " " + to_string(neighborLabels[j]);
  }
  return out;
}
`;
