/**
 * C++ source text for every stdin-parsing helper the generated harnesses
 * call. Each function is small, independently named, and does exactly one
 * parsing job — composed together per family in mainByFamily.ts rather
 * than inlined into one large generator.
 *
 * `parseIntLine` and `trimTrailingNewline` keep their original names/
 * bodies verbatim (pre-existing, used by two-sum/binary-search/etc.);
 * every new helper is prefixed `judge_` to avoid any collision with a
 * contestant's own global-scope identifiers.
 *
 * Deliberately does NOT define TreeNode/ListNode/Node itself: whenever a
 * contract needs one of those, the contestant's own source (generated from
 * the same shared template) already defines it earlier in the compiled
 * unit. Defining it again here would collide with that definition — see
 * generate.ts, which injects a struct only when the contestant's source
 * doesn't already contain it (e.g. a standalone/custom submission).
 */
export const PARSER_HELPERS = String.raw`
static vector<int> parseIntLine(const string& line) {
  vector<int> nums;
  stringstream ss(line);
  int x;
  while (ss >> x) nums.push_back(x);
  return nums;
}

static string trimTrailingNewline(string s) {
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
  return s;
}

static int judge_parseInt(const string& line) {
  if (line.empty()) return 0;
  stringstream ss(line);
  int x = 0;
  ss >> x;
  return x;
}

static vector<string> judge_tokenize(const string& line) {
  vector<string> tokens;
  stringstream ss(line);
  string tok;
  while (ss >> tok) tokens.push_back(tok);
  return tokens;
}

static vector<vector<int>> judge_parseIntervalsWithCount(
    const vector<string>& lines, size_t start, int n) {
  vector<vector<int>> intervals;
  for (int i = 0; i < n; i++) {
    vector<int> parts = parseIntLine(lines[start + i]);
    intervals.push_back(parts);
  }
  return intervals;
}

static vector<vector<int>> judge_parseIntMatrix(
    const vector<string>& lines, size_t start, int rows) {
  vector<vector<int>> grid;
  for (int i = 0; i < rows; i++) grid.push_back(parseIntLine(lines[start + i]));
  return grid;
}

static vector<vector<char>> judge_parseCharMatrixFromInts(
    const vector<string>& lines, size_t start, int rows) {
  vector<vector<char>> grid;
  for (int i = 0; i < rows; i++) {
    vector<string> tokens = judge_tokenize(lines[start + i]);
    vector<char> row;
    for (const string& t : tokens) row.push_back(t == "1" ? '1' : '0');
    grid.push_back(row);
  }
  return grid;
}

static vector<vector<char>> judge_parseCharMatrixFromLetters(
    const vector<string>& lines, size_t start, int rows) {
  vector<vector<char>> grid;
  for (int i = 0; i < rows; i++) {
    vector<string> tokens = judge_tokenize(lines[start + i]);
    vector<char> row;
    for (const string& t : tokens) row.push_back(t.empty() ? ' ' : t[0]);
    grid.push_back(row);
  }
  return grid;
}

static TreeNode* judge_parseTree(const string& line) {
  vector<string> raw = judge_tokenize(line);
  if (raw.empty()) return nullptr;
  vector<long long> values;
  bool rootIsNull = raw[0] == "null";
  if (rootIsNull) return nullptr;
  for (const string& t : raw) values.push_back(t == "null" ? LLONG_MIN : stoll(t));

  TreeNode* root = new TreeNode((int)values[0]);
  vector<TreeNode*> queue;
  queue.push_back(root);
  size_t i = 1;
  size_t qi = 0;
  while (qi < queue.size() && i < values.size()) {
    TreeNode* node = queue[qi++];
    if (i < values.size()) {
      long long v = values[i++];
      if (v != LLONG_MIN) {
        node->left = new TreeNode((int)v);
        queue.push_back(node->left);
      }
    }
    if (i < values.size()) {
      long long v = values[i++];
      if (v != LLONG_MIN) {
        node->right = new TreeNode((int)v);
        queue.push_back(node->right);
      }
    }
  }
  return root;
}

static TreeNode* judge_findTreeNodeByValue(TreeNode* root, int val) {
  if (!root) return nullptr;
  if (root->val == val) return root;
  TreeNode* left = judge_findTreeNodeByValue(root->left, val);
  if (left) return left;
  return judge_findTreeNodeByValue(root->right, val);
}

static ListNode* judge_parseList(const string& line) {
  vector<int> values = parseIntLine(line);
  ListNode dummy(0);
  ListNode* tail = &dummy;
  for (int v : values) {
    tail->next = new ListNode(v);
    tail = tail->next;
  }
  return dummy.next;
}

static ListNode* judge_parseListWithCycle(const string& valuesLine, const string& posLine) {
  vector<int> values = parseIntLine(valuesLine);
  int pos = judge_parseInt(posLine);
  if (values.empty()) return nullptr;
  vector<ListNode*> nodes;
  for (int v : values) nodes.push_back(new ListNode(v));
  for (size_t i = 0; i + 1 < nodes.size(); i++) nodes[i]->next = nodes[i + 1];
  if (pos >= 0 && pos < (int)nodes.size()) nodes.back()->next = nodes[pos];
  return nodes[0];
}

static vector<ListNode*> judge_parseListGroup(const string& line) {
  vector<ListNode*> lists;
  size_t start = 0;
  while (true) {
    size_t pos = line.find('|', start);
    if (pos == string::npos) {
      lists.push_back(judge_parseList(line.substr(start)));
      break;
    }
    lists.push_back(judge_parseList(line.substr(start, pos - start)));
    start = pos + 1;
  }
  return lists;
}

static Node* judge_parseGraphNode(const vector<string>& lines) {
  unordered_map<int, Node*> nodes;
  unordered_map<int, vector<int>> neighborLabels;
  for (const string& line : lines) {
    if (line.find(':') == string::npos) continue;
    size_t colon = line.find(':');
    int label = judge_parseInt(line.substr(0, colon));
    if (!nodes.count(label)) nodes[label] = new Node(label);
    vector<int> neighbors = parseIntLine(line.substr(colon + 1));
    neighborLabels[label] = neighbors;
    for (int n : neighbors) {
      if (!nodes.count(n)) nodes[n] = new Node(n);
    }
  }
  for (const auto& entry : neighborLabels) {
    for (int n : entry.second) nodes[entry.first]->neighbors.push_back(nodes[n]);
  }
  return nodes.count(1) ? nodes[1] : nullptr;
}
`;
