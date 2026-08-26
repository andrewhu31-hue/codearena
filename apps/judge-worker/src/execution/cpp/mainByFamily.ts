import type { CppContract, CppFamily } from "@codearena/shared";

function m0(contract: CppContract): string {
  return contract.methods[0]!.name;
}

// --- vecInt-based families ---------------------------------------------

function vecInt_to_int(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  Solution solution;
  cout << solution.${m0(c)}(nums);`;
}

function vecInt_to_bool(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  Solution solution;
  judge_printBool(solution.${m0(c)}(nums));`;
}

function vecInt_to_vecInt(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  Solution solution;
  printVecInt(solution.${m0(c)}(nums));`;
}

function vecInt_to_vecvecInt(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  Solution solution;
  judge_printNormalizedGroups(solution.${m0(c)}(nums));`;
}

function vecInt_int_to_int(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  int target = judge_parseInt(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  cout << solution.${m0(c)}(nums, target);`;
}

function vecInt_target_to_vecInt(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  int target = judge_parseInt(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  printVecInt(solution.${m0(c)}(nums, target));`;
}

function vecInt_int_to_vecInt(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  int k = judge_parseInt(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  printVecInt(solution.${m0(c)}(nums, k));`;
}

function vecInt_int_to_vecvecInt(c: CppContract): string {
  return `
  vector<int> nums = parseIntLine(lines[0]);
  int target = judge_parseInt(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  judge_printNormalizedGroups(solution.${m0(c)}(nums, target));`;
}

// --- scalar int/uint families --------------------------------------------

function int_to_int(c: CppContract): string {
  return `
  int n = judge_parseInt(lines[0]);
  Solution solution;
  cout << solution.${m0(c)}(n);`;
}

function int_to_vecInt(c: CppContract): string {
  return `
  int n = judge_parseInt(lines[0]);
  Solution solution;
  printVecInt(solution.${m0(c)}(n));`;
}

function int_to_vecString(c: CppContract): string {
  return `
  int n = judge_parseInt(lines[0]);
  Solution solution;
  printVecStringLines(solution.${m0(c)}(n));`;
}

function uint_to_uint(c: CppContract): string {
  return `
  uint32_t n = (uint32_t)stoull(lines[0].empty() ? "0" : lines[0]);
  Solution solution;
  cout << solution.${m0(c)}(n);`;
}

function uint_to_int(c: CppContract): string {
  return `
  uint32_t n = (uint32_t)stoull(lines[0].empty() ? "0" : lines[0]);
  Solution solution;
  cout << solution.${m0(c)}(n);`;
}

function twoInt_to_int(c: CppContract): string {
  return `
  vector<int> parts = parseIntLine(lines[0]);
  Solution solution;
  cout << solution.${m0(c)}(parts[0], parts[1]);`;
}

// --- string-based families ------------------------------------------------

function string_to_string(c: CppContract): string {
  return `
  string s = lines[0];
  Solution solution;
  cout << solution.${m0(c)}(s);`;
}

function string_to_int(c: CppContract): string {
  return `
  string s = lines[0];
  Solution solution;
  cout << solution.${m0(c)}(s);`;
}

function string_to_bool(c: CppContract): string {
  return `
  string s = lines[0];
  Solution solution;
  judge_printBool(solution.${m0(c)}(s));`;
}

function twoString_to_bool(c: CppContract): string {
  return `
  string a = lines[0];
  string b = lines.size() > 1 ? lines[1] : "";
  Solution solution;
  judge_printBool(solution.${m0(c)}(a, b));`;
}

function twoString_to_int(c: CppContract): string {
  return `
  string a = lines[0];
  string b = lines.size() > 1 ? lines[1] : "";
  Solution solution;
  cout << solution.${m0(c)}(a, b);`;
}

function twoString_to_string(c: CppContract): string {
  return `
  string a = lines[0];
  string b = lines.size() > 1 ? lines[1] : "";
  Solution solution;
  cout << solution.${m0(c)}(a, b);`;
}

function string_int_to_int(c: CppContract): string {
  return `
  string s = lines[0];
  int k = judge_parseInt(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  cout << solution.${m0(c)}(s, k);`;
}

function string_vecString_to_bool(c: CppContract): string {
  return `
  string s = lines[0];
  vector<string> dict = judge_tokenize(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  judge_printBool(solution.${m0(c)}(s, dict));`;
}

function vecString_to_vecvecString(c: CppContract): string {
  return `
  vector<string> words = judge_tokenize(lines[0]);
  Solution solution;
  judge_printNormalizedStringGroups(solution.${m0(c)}(words));`;
}

function vecString_to_string(c: CppContract): string {
  return `
  vector<string> words = judge_tokenize(lines[0]);
  Solution solution;
  cout << solution.${m0(c)}(words);`;
}

// --- matrix-based families -------------------------------------------------

function matrix_to_void(c: CppContract): string {
  return `
  vector<int> header = parseIntLine(lines[0]);
  int rows = header[0];
  vector<vector<int>> matrix = judge_parseIntMatrix(lines, 1, rows);
  Solution solution;
  solution.${m0(c)}(matrix);
  judge_printMatrixRows(matrix);`;
}

function matrix_to_vecInt(c: CppContract): string {
  return `
  vector<int> header = parseIntLine(lines[0]);
  int rows = header[0];
  vector<vector<int>> matrix = judge_parseIntMatrix(lines, 1, rows);
  Solution solution;
  printVecInt(solution.${m0(c)}(matrix));`;
}

function charMatrix_to_int(c: CppContract): string {
  return `
  vector<int> header = parseIntLine(lines[0]);
  int rows = header[0];
  vector<vector<char>> grid = judge_parseCharMatrixFromInts(lines, 1, rows);
  Solution solution;
  cout << solution.${m0(c)}(grid);`;
}

function matrix_to_vecvecInt(c: CppContract): string {
  return `
  vector<int> header = parseIntLine(lines[0]);
  int rows = header[0];
  vector<vector<int>> matrix = judge_parseIntMatrix(lines, 1, rows);
  Solution solution;
  judge_printSortedCoordinates(solution.${m0(c)}(matrix));`;
}

function charMatrix_string_to_bool(c: CppContract): string {
  return `
  vector<int> header = parseIntLine(lines[0]);
  int rows = header[0];
  vector<vector<char>> board = judge_parseCharMatrixFromLetters(lines, 1, rows);
  string word = lines[1 + rows];
  Solution solution;
  judge_printBool(solution.${m0(c)}(board, word));`;
}

// --- interval families -------------------------------------------------

/** Preserved verbatim from the pre-existing intervals_to_intervals harness. */
function intervals_to_intervals(c: CppContract): string {
  return `
  string all;
  for (size_t i = 0; i < lines.size(); i++) { all += lines[i]; all += '\\n'; }
  vector<vector<int>> intervals;
  { stringstream ss(all); int a, b; while (ss >> a >> b) intervals.push_back({a, b}); }
  Solution solution;
  printIntervals(solution.${m0(c)}(intervals));`;
}

function intervals_to_bool(c: CppContract): string {
  return `
  int n = judge_parseInt(lines[0]);
  vector<vector<int>> intervals = judge_parseIntervalsWithCount(lines, 1, n);
  Solution solution;
  judge_printBool(solution.${m0(c)}(intervals));`;
}

function intervals_to_int(c: CppContract): string {
  return `
  int n = judge_parseInt(lines[0]);
  vector<vector<int>> intervals = judge_parseIntervalsWithCount(lines, 1, n);
  Solution solution;
  cout << solution.${m0(c)}(intervals);`;
}

function intervals_interval_to_intervals(c: CppContract): string {
  return `
  int n = judge_parseInt(lines[0]);
  vector<vector<int>> intervals = judge_parseIntervalsWithCount(lines, 1, n);
  vector<int> newInterval = parseIntLine(lines[1 + n]);
  Solution solution;
  printIntervals(solution.${m0(c)}(intervals, newInterval));`;
}

// --- graph families -------------------------------------------------

function graph_to_bool(c: CppContract): string {
  return `
  vector<int> header = parseIntLine(lines[0]);
  int n = header[0];
  int m = header.size() > 1 ? header[1] : judge_parseInt(lines[1]);
  size_t edgeStart = header.size() > 1 ? 1 : 2;
  vector<vector<int>> edges = judge_parseIntervalsWithCount(lines, edgeStart, m);
  Solution solution;
  judge_printBool(solution.${m0(c)}(n, edges));`;
}

function graph_to_int(c: CppContract): string {
  return `
  vector<int> header = parseIntLine(lines[0]);
  int n = header[0];
  int m = header.size() > 1 ? header[1] : judge_parseInt(lines[1]);
  size_t edgeStart = header.size() > 1 ? 1 : 2;
  vector<vector<int>> edges = judge_parseIntervalsWithCount(lines, edgeStart, m);
  Solution solution;
  cout << solution.${m0(c)}(n, edges);`;
}

function graphNode_to_graphNode(c: CppContract): string {
  return `
  Node* start = judge_parseGraphNode(lines);
  Solution solution;
  Node* cloned = solution.${m0(c)}(start);
  cout << judge_serializeGraphNode(cloned);`;
}

// --- tree families -------------------------------------------------

function tree_to_int(c: CppContract): string {
  return `
  TreeNode* root = judge_parseTree(lines[0]);
  Solution solution;
  cout << solution.${m0(c)}(root);`;
}

function tree_to_bool(c: CppContract): string {
  return `
  TreeNode* root = judge_parseTree(lines[0]);
  Solution solution;
  judge_printBool(solution.${m0(c)}(root));`;
}

function tree_to_tree(c: CppContract): string {
  return `
  TreeNode* root = judge_parseTree(lines[0]);
  Solution solution;
  cout << judge_serializeTree(solution.${m0(c)}(root));`;
}

function tree_to_vecvecInt(c: CppContract): string {
  return `
  TreeNode* root = judge_parseTree(lines[0]);
  Solution solution;
  vector<vector<int>> levels = solution.${m0(c)}(root);
  for (size_t i = 0; i < levels.size(); i++) {
    if (i) cout << '\\n';
    printVecInt(levels[i]);
  }`;
}

function tree_int_to_int(c: CppContract): string {
  return `
  TreeNode* root = judge_parseTree(lines[0]);
  int k = judge_parseInt(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  cout << solution.${m0(c)}(root, k);`;
}

function tree_twoInt_to_int(c: CppContract): string {
  return `
  TreeNode* root = judge_parseTree(lines[0]);
  vector<int> pq = parseIntLine(lines.size() > 1 ? lines[1] : "");
  TreeNode* pNode = judge_findTreeNodeByValue(root, pq[0]);
  TreeNode* qNode = judge_findTreeNodeByValue(root, pq[1]);
  Solution solution;
  TreeNode* result = solution.${m0(c)}(root, pNode, qNode);
  cout << (result ? result->val : 0);`;
}

function twoTree_to_bool(c: CppContract): string {
  return `
  TreeNode* a = judge_parseTree(lines[0]);
  TreeNode* b = judge_parseTree(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  judge_printBool(solution.${m0(c)}(a, b));`;
}

function twoVecInt_to_tree(c: CppContract): string {
  return `
  vector<int> preorder = parseIntLine(lines[0]);
  vector<int> inorder = parseIntLine(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  cout << judge_serializeTree(solution.${m0(c)}(preorder, inorder));`;
}

// --- linked-list families -------------------------------------------------

function list_to_list(c: CppContract): string {
  return `
  ListNode* head = judge_parseList(lines[0]);
  Solution solution;
  cout << judge_serializeList(solution.${m0(c)}(head));`;
}

function list_to_void(c: CppContract): string {
  return `
  ListNode* head = judge_parseList(lines[0]);
  Solution solution;
  solution.${m0(c)}(head);
  cout << judge_serializeList(head);`;
}

function list_int_to_list(c: CppContract): string {
  return `
  ListNode* head = judge_parseList(lines[0]);
  int n = judge_parseInt(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  cout << judge_serializeList(solution.${m0(c)}(head, n));`;
}

function twoList_to_list(c: CppContract): string {
  return `
  ListNode* a = judge_parseList(lines[0]);
  ListNode* b = judge_parseList(lines.size() > 1 ? lines[1] : "");
  Solution solution;
  cout << judge_serializeList(solution.${m0(c)}(a, b));`;
}

function vecList_to_list(c: CppContract): string {
  return `
  string allListsLine;
  for (size_t i = 0; i < lines.size(); i++) { if (i) allListsLine += ' '; allListsLine += lines[i]; }
  vector<ListNode*> lists = judge_parseListGroup(allListsLine);
  Solution solution;
  cout << judge_serializeList(solution.${m0(c)}(lists));`;
}

function listWithCycle_to_bool(c: CppContract): string {
  return `
  ListNode* head = judge_parseListWithCycle(lines[0], lines.size() > 1 ? lines[1] : "-1");
  Solution solution;
  judge_printBool(solution.${m0(c)}(head));`;
}

// --- codec / operation-sequence families -----------------------------------

function codec_vecString_string(c: CppContract): string {
  const [encode, decode] = c.methods;
  return `
  vector<string> strs;
  {
    const string& line = lines[0];
    size_t start = 0;
    while (true) {
      size_t pos = line.find('|', start);
      if (pos == string::npos) {
        strs.push_back(line.substr(start));
        break;
      }
      strs.push_back(line.substr(start, pos - start));
      start = pos + 1;
    }
  }
  Solution solution;
  string encoded = solution.${encode!.name}(strs);
  vector<string> decoded = solution.${decode!.name}(encoded);
  for (size_t i = 0; i < decoded.size(); i++) {
    if (i) cout << '|';
    cout << decoded[i];
  }`;
}

function codec_tree_string(c: CppContract): string {
  const [serialize, deserialize] = c.methods;
  return `
  TreeNode* original = judge_parseTree(lines[0]);
  Solution solution;
  string data = solution.${serialize!.name}(original);
  TreeNode* restored = solution.${deserialize!.name}(data);
  cout << judge_serializeTree(restored);`;
}

function opseq_trie(c: CppContract): string {
  const [insert, search, startsWith] = c.methods;
  return `
  Solution solution;
  vector<string> outputs;
  for (const string& line : lines) {
    if (line.empty()) continue;
    size_t sp = line.find(' ');
    string op = line.substr(0, sp);
    string value = sp == string::npos ? "" : line.substr(sp + 1);
    if (op == "insert") {
      solution.${insert!.name}(value);
    } else if (op == "search") {
      outputs.push_back(solution.${search!.name}(value) ? "true" : "false");
    } else if (op == "startsWith") {
      outputs.push_back(solution.${startsWith!.name}(value) ? "true" : "false");
    }
  }
  printVecStringLines(outputs);`;
}

function opseq_worddict(c: CppContract): string {
  const [addWord, search] = c.methods;
  return `
  Solution solution;
  vector<string> outputs;
  for (const string& line : lines) {
    if (line.empty()) continue;
    size_t sp = line.find(' ');
    string op = line.substr(0, sp);
    string value = sp == string::npos ? "" : line.substr(sp + 1);
    if (op == "addWord") {
      solution.${addWord!.name}(value);
    } else if (op == "search") {
      outputs.push_back(solution.${search!.name}(value) ? "true" : "false");
    }
  }
  printVecStringLines(outputs);`;
}

export const MAIN_BODY_BY_FAMILY: Record<CppFamily, (contract: CppContract) => string> = {
  vecInt_to_int,
  vecInt_to_bool,
  vecInt_to_vecInt,
  vecInt_to_vecvecInt,
  vecInt_int_to_int,
  vecInt_target_to_vecInt,
  vecInt_int_to_vecInt,
  vecInt_int_to_vecvecInt,
  int_to_int,
  int_to_vecInt,
  int_to_vecString,
  uint_to_uint,
  uint_to_int,
  twoInt_to_int,
  string_to_string,
  string_to_int,
  string_to_bool,
  twoString_to_bool,
  twoString_to_int,
  twoString_to_string,
  string_int_to_int,
  string_vecString_to_bool,
  vecString_to_vecvecString,
  vecString_to_string,
  matrix_to_void,
  matrix_to_vecInt,
  charMatrix_to_int,
  matrix_to_vecvecInt,
  charMatrix_string_to_bool,
  intervals_to_intervals,
  intervals_to_bool,
  intervals_to_int,
  intervals_interval_to_intervals,
  graph_to_bool,
  graph_to_int,
  tree_to_int,
  tree_to_bool,
  tree_to_tree,
  tree_to_vecvecInt,
  tree_int_to_int,
  tree_twoInt_to_int,
  twoTree_to_bool,
  twoVecInt_to_tree,
  list_to_list,
  list_to_void,
  list_int_to_list,
  twoList_to_list,
  vecList_to_list,
  listWithCycle_to_bool,
  graphNode_to_graphNode,
  codec_vecString_string,
  codec_tree_string,
  opseq_trie,
  opseq_worddict,
};
