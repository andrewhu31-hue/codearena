import type { CanonicalSlug } from "@codearena/shared";

export interface ReferenceImplementation {
  /** Aligned 1:1 with the contract's `methods` array, in order. */
  methodBodies: string[];
  /** Injected as a `private:` section when the class needs shared state. */
  memberFields?: string;
}

/**
 * One correct, independently-written C++ implementation per problem,
 * matching the exact method name(s)/signature(s) in the shared contract
 * registry. Used by both the automated Docker harness-contract tests and
 * the real-judge submission pass — a single source of truth for "what does
 * a correct class-only C++ solution look like for this problem".
 */
export const REFERENCE_IMPLEMENTATIONS: Record<CanonicalSlug, ReferenceImplementation> = {
  "two-sum": {
    methodBodies: [
      `unordered_map<int,int> seen;
for (int i=0;i<(int)nums.size();i++){
  int need=target-nums[i];
  auto it=seen.find(need);
  if(it!=seen.end()) return {it->second, i};
  seen[nums[i]]=i;
}
return {};`,
    ],
  },
  "binary-search": {
    methodBodies: [
      `int lo=0, hi=(int)nums.size()-1;
while(lo<=hi){
  int mid=lo+(hi-lo)/2;
  if(nums[mid]==target) return mid;
  if(nums[mid]<target) lo=mid+1; else hi=mid-1;
}
return -1;`,
    ],
  },
  "longest-substring": {
    methodBodies: [
      `unordered_map<char,int> last;
int start=0, best=0;
for(int i=0;i<(int)s.size();i++){
  char c=s[i];
  if(last.count(c) && last[c]>=start) start=last[c]+1;
  last[c]=i;
  best=max(best, i-start+1);
}
return best;`,
    ],
  },
  "reverse-string": {
    methodBodies: [`reverse(s.begin(), s.end());\nreturn s;`],
  },
  "fizz-buzz": {
    methodBodies: [
      `vector<string> res;
for(int i=1;i<=n;i++){
  if(i%15==0) res.push_back("FizzBuzz");
  else if(i%3==0) res.push_back("Fizz");
  else if(i%5==0) res.push_back("Buzz");
  else res.push_back(to_string(i));
}
return res;`,
    ],
  },
  "merge-intervals": {
    methodBodies: [
      `sort(intervals.begin(), intervals.end());
vector<vector<int>> merged;
for(auto& iv: intervals){
  if(!merged.empty() && iv[0]<=merged.back()[1]) merged.back()[1]=max(merged.back()[1], iv[1]);
  else merged.push_back(iv);
}
return merged;`,
    ],
  },

  "best-time-to-buy-and-sell-stock": {
    methodBodies: [
      `int minPrice=INT_MAX, best=0;
for(int p: nums){ minPrice=min(minPrice,p); best=max(best,p-minPrice); }
return best;`,
    ],
  },
  "maximum-subarray": {
    methodBodies: [
      `int best=nums[0], cur=nums[0];
for(int i=1;i<(int)nums.size();i++){ cur=max(nums[i], cur+nums[i]); best=max(best,cur); }
return best;`,
    ],
  },
  "maximum-product-subarray": {
    methodBodies: [
      `long long maxP=nums[0], minP=nums[0], best=nums[0];
for(int i=1;i<(int)nums.size();i++){
  long long v=nums[i];
  long long a=v, b=maxP*v, c=minP*v;
  maxP=max({a,b,c}); minP=min({a,b,c});
  best=max(best,maxP);
}
return (int)best;`,
    ],
  },
  "house-robber": {
    methodBodies: [
      `int take=0, skip=0;
for(int v: nums){ int nt=skip+v; skip=max(take,skip); take=nt; }
return max(take,skip);`,
    ],
  },
  "house-robber-ii": {
    methodBodies: [
      `if(nums.size()==1) return nums[0];
auto robLine=[](vector<int> arr)->int{
  int take=0, skip=0;
  for(int v: arr){ int nt=skip+v; skip=max(take,skip); take=nt; }
  return max(take,skip);
};
vector<int> a(nums.begin()+1, nums.end());
vector<int> b(nums.begin(), nums.end()-1);
return max(robLine(a), robLine(b));`,
    ],
  },
  "container-with-most-water": {
    methodBodies: [
      `int l=0, r=(int)height.size()-1, best=0;
while(l<r){
  best=max(best, min(height[l],height[r])*(r-l));
  if(height[l]<height[r]) l++; else r--;
}
return best;`,
    ],
  },
  "missing-number": {
    methodBodies: [
      `long long n=(long long)nums.size();
long long expected=n*(n+1)/2;
long long actual=0;
for(int v: nums) actual+=v;
return (int)(expected-actual);`,
    ],
  },
  "longest-consecutive-sequence": {
    methodBodies: [
      `unordered_set<int> s(nums.begin(), nums.end());
int best=0;
for(int n: s){
  if(s.count(n-1)) continue;
  int len=1, cur=n;
  while(s.count(cur+1)){ cur++; len++; }
  best=max(best,len);
}
return best;`,
    ],
  },
  "longest-increasing-subsequence": {
    methodBodies: [
      `vector<int> tails;
for(int n: nums){
  auto it=lower_bound(tails.begin(), tails.end(), n);
  if(it==tails.end()) tails.push_back(n); else *it=n;
}
return (int)tails.size();`,
    ],
  },
  "find-minimum-in-rotated-sorted-array": {
    methodBodies: [
      `int lo=0, hi=(int)nums.size()-1;
while(lo<hi){
  int mid=lo+(hi-lo)/2;
  if(nums[mid]>nums[hi]) lo=mid+1; else hi=mid;
}
return nums[lo];`,
    ],
  },

  "contains-duplicate": {
    methodBodies: [
      `unordered_set<int> s;
for(int v: nums){ if(s.count(v)) return true; s.insert(v); }
return false;`,
    ],
  },
  "jump-game": {
    methodBodies: [
      `int reach=0;
for(int i=0;i<(int)nums.size();i++){ if(i>reach) return false; reach=max(reach, i+nums[i]); }
return true;`,
    ],
  },

  "product-of-array-except-self": {
    methodBodies: [
      `int n=(int)nums.size();
vector<int> out(n,1);
int prefix=1;
for(int i=0;i<n;i++){ out[i]=prefix; prefix*=nums[i]; }
int suffix=1;
for(int i=n-1;i>=0;i--){ out[i]*=suffix; suffix*=nums[i]; }
return out;`,
    ],
  },

  "three-sum": {
    methodBodies: [
      `sort(nums.begin(), nums.end());
vector<vector<int>> res;
int n=(int)nums.size();
for(int i=0;i<n-2;i++){
  if(i>0 && nums[i]==nums[i-1]) continue;
  int l=i+1, r=n-1;
  while(l<r){
    int sum=nums[i]+nums[l]+nums[r];
    if(sum==0){
      res.push_back({nums[i],nums[l],nums[r]});
      l++; r--;
      while(l<r && nums[l]==nums[l-1]) l++;
      while(l<r && nums[r]==nums[r+1]) r--;
    } else if(sum<0) l++; else r--;
  }
}
return res;`,
    ],
  },

  "search-in-rotated-sorted-array": {
    methodBodies: [
      `int lo=0, hi=(int)nums.size()-1;
while(lo<=hi){
  int mid=lo+(hi-lo)/2;
  if(nums[mid]==target) return mid;
  if(nums[lo]<=nums[mid]){
    if(nums[lo]<=target && target<nums[mid]) hi=mid-1; else lo=mid+1;
  } else {
    if(nums[mid]<target && target<=nums[hi]) lo=mid+1; else hi=mid-1;
  }
}
return -1;`,
    ],
  },
  "coin-change": {
    methodBodies: [
      `vector<int> dp(amount+1, INT_MAX);
dp[0]=0;
for(int a=1;a<=amount;a++){
  for(int c: coins){
    if(c<=a && dp[a-c]!=INT_MAX) dp[a]=min(dp[a], dp[a-c]+1);
  }
}
return dp[amount]==INT_MAX ? -1 : dp[amount];`,
    ],
  },

  "top-k-frequent-elements": {
    methodBodies: [
      `unordered_map<int,int> freq;
for(int v: nums) freq[v]++;
vector<pair<int,int>> entries(freq.begin(), freq.end());
sort(entries.begin(), entries.end(), [](const pair<int,int>&a, const pair<int,int>&b){
  if(a.second!=b.second) return a.second>b.second;
  return a.first<b.first;
});
vector<int> res;
for(int i=0;i<k && i<(int)entries.size();i++) res.push_back(entries[i].first);
return res;`,
    ],
  },

  "combination-sum": {
    methodBodies: [
      `sort(candidates.begin(), candidates.end());
vector<vector<int>> res;
vector<int> cur;
function<void(int,int)> backtrack=[&](int start, int remaining){
  if(remaining==0){ res.push_back(cur); return; }
  for(int i=start;i<(int)candidates.size();i++){
    if(candidates[i]>remaining) break;
    cur.push_back(candidates[i]);
    backtrack(i, remaining-candidates[i]);
    cur.pop_back();
  }
};
backtrack(0, target);
return res;`,
    ],
  },

  "climbing-stairs": {
    methodBodies: [`int a=1,b=1;\nfor(int i=2;i<=n;i++){ int c=a+b; a=b; b=c; }\nreturn b;`],
  },
  "number-of-1-bits": {
    methodBodies: [
      `int count=0;\nuint32_t x=n;\nwhile(x){ count += (x&1); x >>= 1; }\nreturn count;`,
    ],
  },

  "counting-bits": {
    methodBodies: [
      `vector<int> res(n+1,0);\nfor(int i=1;i<=n;i++) res[i]=res[i>>1]+(i&1);\nreturn res;`,
    ],
  },

  "reverse-bits": {
    methodBodies: [
      `uint32_t result=0;
for(int i=0;i<32;i++){ result = (result<<1) | (n&1); n >>= 1; }
return result;`,
    ],
  },

  "sum-of-two-integers": {
    methodBodies: [`return a+b;`],
  },
  "unique-paths": {
    methodBodies: [
      `vector<long long> row(n,1);
for(int i=1;i<m;i++){ for(int j=1;j<n;j++){ row[j]+=row[j-1]; } }
return (int)row[n-1];`,
    ],
  },

  "decode-ways": {
    methodBodies: [
      `int n=(int)s.size();
vector<int> dp(n+1,0);
dp[0]=1;
for(int i=1;i<=n;i++){
  if(s[i-1]!='0') dp[i]+=dp[i-1];
  if(i>=2){
    int two=(s[i-2]-'0')*10+(s[i-1]-'0');
    if(s[i-2]!='0' && two>=10 && two<=26) dp[i]+=dp[i-2];
  }
}
return dp[n];`,
    ],
  },
  "palindromic-substrings": {
    methodBodies: [
      `int n=(int)s.size(), count=0;
for(int center=0; center<2*n-1; center++){
  int l=center/2, r=l+center%2;
  while(l>=0 && r<n && s[l]==s[r]){ count++; l--; r++; }
}
return count;`,
    ],
  },

  "valid-palindrome": {
    methodBodies: [
      `string t;
for(char c: s) if(isalnum((unsigned char)c)) t += (char)tolower((unsigned char)c);
int l=0, r=(int)t.size()-1;
while(l<r){ if(t[l]!=t[r]) return false; l++; r--; }
return true;`,
    ],
  },
  "valid-parentheses": {
    methodBodies: [
      `unordered_map<char,char> pairs = {{')','('},{']','['},{'}','{'}};
vector<char> stack;
for(char c: s){
  if(c=='('||c=='['||c=='{') stack.push_back(c);
  else if(pairs.count(c)){
    if(stack.empty() || stack.back()!=pairs[c]) return false;
    stack.pop_back();
  }
}
return stack.empty();`,
    ],
  },

  "valid-anagram": {
    methodBodies: [
      `if(s.size()!=t.size()) return false;
unordered_map<char,int> counts;
for(char c: s) counts[c]++;
for(char c: t){ if(--counts[c]<0) return false; }
return true;`,
    ],
  },

  "longest-common-subsequence": {
    methodBodies: [
      `int n=(int)text1.size(), m=(int)text2.size();
vector<vector<int>> dp(n+1, vector<int>(m+1,0));
for(int i=1;i<=n;i++) for(int j=1;j<=m;j++){
  if(text1[i-1]==text2[j-1]) dp[i][j]=dp[i-1][j-1]+1;
  else dp[i][j]=max(dp[i-1][j], dp[i][j-1]);
}
return dp[n][m];`,
    ],
  },

  "minimum-window-substring": {
    methodBodies: [
      `if(t.empty()) return "";
unordered_map<char,int> need;
for(char c: t) need[c]++;
int required=(int)need.size();
unordered_map<char,int> window;
int formed=0, left=0, bestLen=INT_MAX, bestStart=0;
for(int right=0; right<(int)s.size(); right++){
  char c=s[right];
  window[c]++;
  if(need.count(c) && window[c]==need[c]) formed++;
  while(formed==required){
    if(right-left+1<bestLen){ bestLen=right-left+1; bestStart=left; }
    char lc=s[left];
    window[lc]--;
    if(need.count(lc) && window[lc]<need[lc]) formed--;
    left++;
  }
}
return bestLen==INT_MAX ? "" : s.substr(bestStart, bestLen);`,
    ],
  },

  "longest-repeating-character-replacement": {
    methodBodies: [
      `unordered_map<char,int> counts;
int left=0, maxCount=0, best=0;
for(int right=0; right<(int)s.size(); right++){
  counts[s[right]]++;
  maxCount=max(maxCount, counts[s[right]]);
  while((right-left+1)-maxCount>k){ counts[s[left]]--; left++; }
  best=max(best, right-left+1);
}
return best;`,
    ],
  },

  "word-break": {
    methodBodies: [
      `unordered_set<string> dict(wordDict.begin(), wordDict.end());
int n=(int)s.size();
vector<bool> dp(n+1,false);
dp[0]=true;
for(int i=1;i<=n;i++){
  for(int j=0;j<i;j++){
    if(dp[j] && dict.count(s.substr(j,i-j))){ dp[i]=true; break; }
  }
}
return dp[n];`,
    ],
  },

  "group-anagrams": {
    methodBodies: [
      `unordered_map<string, vector<string>> groups;
for(const string& w: strs){
  string key=w;
  sort(key.begin(), key.end());
  groups[key].push_back(w);
}
vector<vector<string>> res;
for(auto& entry: groups) res.push_back(entry.second);
return res;`,
    ],
  },

  "alien-dictionary": {
    methodBodies: [
      `unordered_set<char> letters;
for(const string& w: words) for(char c: w) letters.insert(c);
unordered_map<char, unordered_set<char>> graph;
unordered_map<char,int> indegree;
for(char c: letters) indegree[c]=0;
for(size_t i=0;i+1<words.size();i++){
  const string& a=words[i]; const string& b=words[i+1];
  size_t minLen=min(a.size(), b.size());
  bool found=false;
  for(size_t j=0;j<minLen;j++){
    if(a[j]!=b[j]){
      if(!graph[a[j]].count(b[j])){ graph[a[j]].insert(b[j]); indegree[b[j]]++; }
      found=true;
      break;
    }
  }
  if(!found && a.size()>b.size()) return "";
}
priority_queue<char, vector<char>, greater<char>> pq;
for(char c: letters) if(indegree[c]==0) pq.push(c);
string order;
while(!pq.empty()){
  char c=pq.top(); pq.pop();
  order += c;
  for(char nxt: graph[c]){ if(--indegree[nxt]==0) pq.push(nxt); }
}
if(order.size()!=letters.size()) return "";
return order;`,
    ],
  },

  "rotate-image": {
    methodBodies: [
      `int n=(int)matrix.size();
for(int i=0;i<n;i++) for(int j=i+1;j<n;j++) swap(matrix[i][j], matrix[j][i]);
for(int i=0;i<n;i++) reverse(matrix[i].begin(), matrix[i].end());`,
    ],
  },
  "set-matrix-zeroes": {
    methodBodies: [
      `int rows=(int)matrix.size();
if(rows==0) return;
int cols=(int)matrix[0].size();
set<int> zeroRows, zeroCols;
for(int i=0;i<rows;i++) for(int j=0;j<cols;j++) if(matrix[i][j]==0){ zeroRows.insert(i); zeroCols.insert(j); }
for(int i=0;i<rows;i++) for(int j=0;j<cols;j++) if(zeroRows.count(i)||zeroCols.count(j)) matrix[i][j]=0;`,
    ],
  },

  "spiral-matrix": {
    methodBodies: [
      `vector<int> res;
if(matrix.empty()) return res;
int top=0, bottom=(int)matrix.size()-1, left=0, right=(int)matrix[0].size()-1;
while(top<=bottom && left<=right){
  for(int c=left;c<=right;c++) res.push_back(matrix[top][c]);
  top++;
  for(int r=top;r<=bottom;r++) res.push_back(matrix[r][right]);
  right--;
  if(top<=bottom){ for(int c=right;c>=left;c--) res.push_back(matrix[bottom][c]); bottom--; }
  if(left<=right){ for(int r=bottom;r>=top;r--) res.push_back(matrix[r][left]); left++; }
}
return res;`,
    ],
  },

  "number-of-islands": {
    methodBodies: [
      `int rows=(int)grid.size();
if(rows==0) return 0;
int cols=(int)grid[0].size();
vector<vector<bool>> seen(rows, vector<bool>(cols,false));
int count=0;
int drs[4]={1,-1,0,0}, dcs[4]={0,0,1,-1};
for(int r=0;r<rows;r++) for(int c=0;c<cols;c++){
  if(grid[r][c]=='1' && !seen[r][c]){
    count++;
    vector<pair<int,int>> stack; stack.push_back({r,c}); seen[r][c]=true;
    while(!stack.empty()){
      pair<int,int> cell=stack.back(); stack.pop_back();
      for(int k=0;k<4;k++){
        int nr=cell.first+drs[k], nc=cell.second+dcs[k];
        if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&!seen[nr][nc]&&grid[nr][nc]=='1'){ seen[nr][nc]=true; stack.push_back({nr,nc}); }
      }
    }
  }
}
return count;`,
    ],
  },

  "pacific-atlantic-water-flow": {
    methodBodies: [
      `int rows=(int)heights.size();
if(rows==0) return {};
int cols=(int)heights[0].size();
int drs[4]={1,-1,0,0}, dcs[4]={0,0,1,-1};
auto bfs=[&](vector<pair<int,int>> starts)->vector<vector<bool>>{
  vector<vector<bool>> reach(rows, vector<bool>(cols,false));
  vector<pair<int,int>> queue;
  for(auto& s: starts){ if(!reach[s.first][s.second]){ reach[s.first][s.second]=true; queue.push_back(s); } }
  size_t qi=0;
  while(qi<queue.size()){
    pair<int,int> cur=queue[qi++];
    for(int k=0;k<4;k++){
      int nr=cur.first+drs[k], nc=cur.second+dcs[k];
      if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&!reach[nr][nc]&&heights[nr][nc]>=heights[cur.first][cur.second]){
        reach[nr][nc]=true; queue.push_back({nr,nc});
      }
    }
  }
  return reach;
};
vector<pair<int,int>> pacificStarts, atlanticStarts;
for(int r=0;r<rows;r++){ pacificStarts.push_back({r,0}); atlanticStarts.push_back({r,cols-1}); }
for(int c=0;c<cols;c++){ pacificStarts.push_back({0,c}); atlanticStarts.push_back({rows-1,c}); }
vector<vector<bool>> pacific=bfs(pacificStarts);
vector<vector<bool>> atlantic=bfs(atlanticStarts);
vector<vector<int>> res;
for(int r=0;r<rows;r++) for(int c=0;c<cols;c++) if(pacific[r][c]&&atlantic[r][c]) res.push_back({r,c});
return res;`,
    ],
  },

  "word-search": {
    methodBodies: [
      `int rows=(int)board.size();
if(rows==0) return word.empty();
int cols=(int)board[0].size();
vector<vector<bool>> seen(rows, vector<bool>(cols,false));
int drs[4]={1,-1,0,0}, dcs[4]={0,0,1,-1};
function<bool(int,int,int)> dfs=[&](int r,int c,int idx)->bool{
  if(r<0||r>=rows||c<0||c>=cols) return false;
  if(seen[r][c] || board[r][c]!=word[idx]) return false;
  if(idx==(int)word.size()-1) return true;
  seen[r][c]=true;
  for(int k=0;k<4;k++){ if(dfs(r+drs[k], c+dcs[k], idx+1)){ seen[r][c]=false; return true; } }
  seen[r][c]=false;
  return false;
};
if(word.empty()) return true;
for(int r=0;r<rows;r++) for(int c=0;c<cols;c++) if(dfs(r,c,0)) return true;
return false;`,
    ],
  },

  "meeting-rooms": {
    methodBodies: [
      `sort(intervals.begin(), intervals.end());
for(size_t i=1;i<intervals.size();i++) if(intervals[i][0]<intervals[i-1][1]) return false;
return true;`,
    ],
  },
  "meeting-rooms-ii": {
    methodBodies: [
      `vector<int> starts, ends;
for(auto& iv: intervals){ starts.push_back(iv[0]); ends.push_back(iv[1]); }
sort(starts.begin(), starts.end());
sort(ends.begin(), ends.end());
int rooms=0, maxRooms=0, i=0, j=0;
while(i<(int)starts.size()){
  if(starts[i]<ends[j]){ rooms++; i++; } else { rooms--; j++; }
  maxRooms=max(maxRooms, rooms);
}
return maxRooms;`,
    ],
  },
  "non-overlapping-intervals": {
    methodBodies: [
      `sort(intervals.begin(), intervals.end(), [](const vector<int>&a, const vector<int>&b){ return a[1]<b[1]; });
int removals=0;
long long lastEnd=LLONG_MIN;
for(auto& iv: intervals){ if(iv[0]<lastEnd) removals++; else lastEnd=iv[1]; }
return removals;`,
    ],
  },
  "insert-interval": {
    methodBodies: [
      `vector<vector<int>> all=intervals;
all.push_back(newInterval);
sort(all.begin(), all.end());
vector<vector<int>> merged;
for(auto& iv: all){
  if(!merged.empty() && iv[0]<=merged.back()[1]) merged.back()[1]=max(merged.back()[1], iv[1]);
  else merged.push_back(iv);
}
return merged;`,
    ],
  },

  "course-schedule": {
    methodBodies: [
      `vector<vector<int>> graph(numCourses);
vector<int> indegree(numCourses,0);
for(auto& p: prerequisites){ graph[p[1]].push_back(p[0]); indegree[p[0]]++; }
vector<int> queue;
for(int i=0;i<numCourses;i++) if(indegree[i]==0) queue.push_back(i);
int visited=0;
size_t qi=0;
while(qi<queue.size()){
  int c=queue[qi++];
  visited++;
  for(int nxt: graph[c]){ if(--indegree[nxt]==0) queue.push_back(nxt); }
}
return visited==numCourses;`,
    ],
  },
  "graph-valid-tree": {
    methodBodies: [
      `if((int)edges.size()!=n-1) return false;
vector<int> parent(n);
for(int i=0;i<n;i++) parent[i]=i;
function<int(int)> find=[&](int x)->int{ while(parent[x]!=x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
for(auto& e: edges){ int ru=find(e[0]), rv=find(e[1]); if(ru==rv) return false; parent[ru]=rv; }
return true;`,
    ],
  },
  "number-of-connected-components-in-an-undirected-graph": {
    methodBodies: [
      `vector<int> parent(n);
for(int i=0;i<n;i++) parent[i]=i;
function<int(int)> find=[&](int x)->int{ while(parent[x]!=x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
for(auto& e: edges){ int ru=find(e[0]), rv=find(e[1]); if(ru!=rv) parent[ru]=rv; }
set<int> roots;
for(int i=0;i<n;i++) roots.insert(find(i));
return (int)roots.size();`,
    ],
  },

  "maximum-depth-of-binary-tree": {
    methodBodies: [
      `function<int(TreeNode*)> depth=[&](TreeNode* node)->int{
  if(!node) return 0;
  return 1+max(depth(node->left), depth(node->right));
};
return depth(root);`,
    ],
  },
  "binary-tree-maximum-path-sum": {
    methodBodies: [
      `int best=INT_MIN;
function<int(TreeNode*)> dfs=[&](TreeNode* node)->int{
  if(!node) return 0;
  int left=max(dfs(node->left), 0);
  int right=max(dfs(node->right), 0);
  best=max(best, node->val+left+right);
  return node->val+max(left,right);
};
dfs(root);
return best;`,
    ],
  },
  "validate-binary-search-tree": {
    methodBodies: [
      `function<bool(TreeNode*, long long, long long)> valid=[&](TreeNode* node, long long lo, long long hi)->bool{
  if(!node) return true;
  if(!(node->val>lo && node->val<hi)) return false;
  return valid(node->left, lo, node->val) && valid(node->right, node->val, hi);
};
return valid(root, LLONG_MIN, LLONG_MAX);`,
    ],
  },
  "invert-binary-tree": {
    methodBodies: [
      `if(!root) return nullptr;
TreeNode* left=invertTree(root->left);
TreeNode* right=invertTree(root->right);
root->left=right;
root->right=left;
return root;`,
    ],
  },
  "binary-tree-level-order-traversal": {
    methodBodies: [
      `vector<vector<int>> res;
if(!root) return res;
vector<TreeNode*> level;
level.push_back(root);
while(!level.empty()){
  vector<int> vals;
  vector<TreeNode*> next;
  for(TreeNode* n: level){
    vals.push_back(n->val);
    if(n->left) next.push_back(n->left);
    if(n->right) next.push_back(n->right);
  }
  res.push_back(vals);
  level=next;
}
return res;`,
    ],
  },
  "kth-smallest-element-in-a-bst": {
    methodBodies: [
      `vector<TreeNode*> stack;
TreeNode* node=root;
int seen=0;
while(!stack.empty() || node){
  while(node){ stack.push_back(node); node=node->left; }
  node=stack.back(); stack.pop_back();
  seen++;
  if(seen==k) return node->val;
  node=node->right;
}
return -1;`,
    ],
  },
  "lowest-common-ancestor-of-a-binary-search-tree": {
    methodBodies: [
      `TreeNode* node=root;
while(node){
  if(p->val<node->val && q->val<node->val) node=node->left;
  else if(p->val>node->val && q->val>node->val) node=node->right;
  else return node;
}
return nullptr;`,
    ],
  },
  "same-tree": {
    methodBodies: [
      `if(!p && !q) return true;
if(!p || !q) return false;
return p->val==q->val && isSameTree(p->left,q->left) && isSameTree(p->right,q->right);`,
    ],
  },
  "subtree-of-another-tree": {
    methodBodies: [
      `function<bool(TreeNode*,TreeNode*)> same=[&](TreeNode* a, TreeNode* b)->bool{
  if(!a && !b) return true;
  if(!a || !b) return false;
  return a->val==b->val && same(a->left,b->left) && same(a->right,b->right);
};
function<bool(TreeNode*)> check=[&](TreeNode* node)->bool{
  if(!node) return false;
  if(same(node, subRoot)) return true;
  return check(node->left) || check(node->right);
};
if(!subRoot) return true;
return check(root);`,
    ],
  },
  "construct-binary-tree-from-preorder-and-inorder-traversal": {
    methodBodies: [
      `unordered_map<int,int> inorderIndex;
for(int i=0;i<(int)inorder.size();i++) inorderIndex[inorder[i]]=i;
int preIdx=0;
function<TreeNode*(int,int)> build=[&](int inLo, int inHi)->TreeNode*{
  if(inLo>inHi) return nullptr;
  int rootVal=preorder[preIdx++];
  TreeNode* node=new TreeNode(rootVal);
  int mid=inorderIndex[rootVal];
  node->left=build(inLo, mid-1);
  node->right=build(mid+1, inHi);
  return node;
};
return build(0, (int)inorder.size()-1);`,
    ],
  },

  "reverse-linked-list": {
    methodBodies: [
      `ListNode* prev=nullptr;
while(head){ ListNode* next=head->next; head->next=prev; prev=head; head=next; }
return prev;`,
    ],
  },
  "reorder-list": {
    methodBodies: [
      `if(!head || !head->next) return;
vector<ListNode*> nodes;
ListNode* cur=head;
while(cur){ nodes.push_back(cur); cur=cur->next; }
int l=0, r=(int)nodes.size()-1;
while(l<r){
  nodes[l]->next=nodes[r];
  l++;
  if(l==r) break;
  nodes[r]->next=nodes[l];
  r--;
}
nodes[l]->next=nullptr;`,
    ],
  },
  "remove-nth-node-from-end-of-list": {
    methodBodies: [
      `ListNode dummy(0);
dummy.next=head;
ListNode* fast=&dummy;
for(int i=0;i<n;i++) fast=fast->next;
ListNode* slow=&dummy;
while(fast->next){ fast=fast->next; slow=slow->next; }
slow->next = slow->next ? slow->next->next : nullptr;
return dummy.next;`,
    ],
  },
  "merge-two-sorted-lists": {
    methodBodies: [
      `ListNode dummy(0);
ListNode* tail=&dummy;
while(l1 && l2){
  if(l1->val<=l2->val){ tail->next=l1; l1=l1->next; }
  else { tail->next=l2; l2=l2->next; }
  tail=tail->next;
}
tail->next = l1 ? l1 : l2;
return dummy.next;`,
    ],
  },
  "merge-k-sorted-lists": {
    methodBodies: [
      `vector<int> vals;
for(ListNode* head: lists){ ListNode* cur=head; while(cur){ vals.push_back(cur->val); cur=cur->next; } }
sort(vals.begin(), vals.end());
ListNode dummy(0);
ListNode* tail=&dummy;
for(int v: vals){ tail->next=new ListNode(v); tail=tail->next; }
return dummy.next;`,
    ],
  },
  "linked-list-cycle": {
    methodBodies: [
      `ListNode* slow=head;
ListNode* fast=head;
while(fast && fast->next){
  slow=slow->next;
  fast=fast->next->next;
  if(slow==fast) return true;
}
return false;`,
    ],
  },

  "clone-graph": {
    methodBodies: [
      `if(!node) return nullptr;
unordered_map<Node*, Node*> mapping;
vector<Node*> stack;
stack.push_back(node);
mapping[node]=new Node(node->val);
while(!stack.empty()){
  Node* cur=stack.back(); stack.pop_back();
  for(Node* nb: cur->neighbors){
    if(!mapping.count(nb)){ mapping[nb]=new Node(nb->val); stack.push_back(nb); }
    mapping[cur]->neighbors.push_back(mapping[nb]);
  }
}
return mapping[node];`,
    ],
  },

  "encode-and-decode-strings": {
    methodBodies: [
      `string res;
for(const string& str: strs){ res += to_string(str.size()) + "#" + str; }
return res;`,
      `vector<string> res;
size_t i=0;
while(i<s.size()){
  size_t j=s.find('#', i);
  int len=stoi(s.substr(i,j-i));
  res.push_back(s.substr(j+1, len));
  i=j+1+len;
}
return res;`,
    ],
  },
  "serialize-and-deserialize-binary-tree": {
    methodBodies: [
      `if(!root) return "null";
string res=to_string(root->val);
vector<TreeNode*> queue;
queue.push_back(root);
size_t qi=0;
while(qi<queue.size()){
  TreeNode* node=queue[qi++];
  if(node->left){ res+=","+to_string(node->left->val); queue.push_back(node->left); } else res+=",null";
  if(node->right){ res+=","+to_string(node->right->val); queue.push_back(node->right); } else res+=",null";
}
return res;`,
      `if(data=="null" || data.empty()) return nullptr;
vector<string> tokens;
{ stringstream ss(data); string tok; while(getline(ss, tok, ',')) tokens.push_back(tok); }
if(tokens.empty() || tokens[0]=="null") return nullptr;
TreeNode* root=new TreeNode(stoi(tokens[0]));
vector<TreeNode*> queue;
queue.push_back(root);
size_t i=1, qi=0;
while(qi<queue.size() && i<tokens.size()){
  TreeNode* node=queue[qi++];
  if(i<tokens.size()){
    if(tokens[i]!="null"){ node->left=new TreeNode(stoi(tokens[i])); queue.push_back(node->left); }
    i++;
  }
  if(i<tokens.size()){
    if(tokens[i]!="null"){ node->right=new TreeNode(stoi(tokens[i])); queue.push_back(node->right); }
    i++;
  }
}
return root;`,
    ],
  },

  "implement-trie-prefix-tree": {
    memberFields: `unordered_set<string> words;\nunordered_set<string> prefixes;`,
    methodBodies: [
      `words.insert(word);
string p;
for(char c: word){ p+=c; prefixes.insert(p); }`,
      `return words.count(word)>0;`,
      `return prefixes.count(prefix)>0;`,
    ],
  },
  "add-and-search-word-data-structure-design": {
    memberFields: `vector<string> words;`,
    methodBodies: [
      `words.push_back(word);`,
      `for(const string& w: words){
  if(w.size()!=word.size()) continue;
  bool match=true;
  for(size_t i=0;i<word.size();i++){ if(word[i]!='.' && word[i]!=w[i]){ match=false; break; } }
  if(match) return true;
}
return false;`,
    ],
  },
};
