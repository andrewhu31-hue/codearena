import {
  getCppContract,
  STRUCT_TEXT_BY_NAME,
  type CppContract,
  type CppStructName,
} from "@codearena/shared";
import { PARSER_HELPERS } from "./parsers.js";
import { SERIALIZER_HELPERS } from "./serializers.js";
import { MAIN_BODY_BY_FAMILY } from "./mainByFamily.js";

export function hasCppMain(sourceCode: string): boolean {
  return /\bint\s+main\s*\(/.test(sourceCode);
}

/**
 * Builds the full `int main() { ... }` block for a contract: reads all of
 * stdin into `lines` once, delegates to the family-specific body, and
 * returns 0. The shared read-all-lines preamble lives here once instead of
 * being repeated inside every family generator.
 */
export function buildCppMain(contract: CppContract): string {
  const family = MAIN_BODY_BY_FAMILY[contract.family];
  const body = family(contract);
  return `
int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  vector<string> lines;
  {
    string line;
    while (getline(cin, line)) {
      while (!line.empty() && line.back() == '\\r') line.pop_back();
      lines.push_back(line);
    }
  }
  // A stored test case with an entirely empty input (0 bytes on stdin) never
  // triggers a single getline() iteration, leaving \`lines\` empty — every
  // family below indexes lines[0] unconditionally, so guarantee at least one
  // (blank) entry rather than reading out of bounds.
  if (lines.empty()) lines.push_back("");
${body}
  return 0;
}
`;
}

/**
 * PARSER_HELPERS/SERIALIZER_HELPERS are a fixed superset — every parsing and
 * serialization helper is always included, regardless of which family is
 * active (see parsers.ts) — so tree/list/graph-node helper *signatures*
 * always reference TreeNode/ListNode/Node, whether or not the current
 * contract itself uses them. That means all three structs always need a
 * definition somewhere in the compiled file. The contestant's own source
 * (generated from the same shared template) already defines whichever ones
 * their contract needs; this fills in only the ones still missing so the
 * harness's helpers always compile without ever redefining what the
 * contestant already provided.
 */
const ALL_STRUCT_NAMES: CppStructName[] = ["TreeNode", "ListNode", "Node"];

function missingStructDefs(sourceCode: string): string {
  const missing = ALL_STRUCT_NAMES.filter((name) => {
    const marker = name === "Node" ? "class Node" : `struct ${name}`;
    return !sourceCode.includes(marker);
  });
  return missing.map((name) => STRUCT_TEXT_BY_NAME[name]).join("\n\n");
}

export function buildCppHarnessSource(contract: CppContract, sourceCode: string): string {
  const structs = missingStructDefs(sourceCode);
  const structsBlock = structs.length > 0 ? `${structs}\n\n` : "";
  return `${structsBlock}${PARSER_HELPERS}\n${SERIALIZER_HELPERS}\n${buildCppMain(contract)}`;
}

export type CppWrapResult =
  | { kind: "standalone"; sourceCode: string }
  | { kind: "wrapped"; sourceCode: string }
  | { kind: "missing_contract"; slug: string | undefined };

/**
 * Decides how a CPP submission should be compiled:
 *  - a source that already contains a valid `main()` is always compiled
 *    standalone, exactly as submitted, regardless of slug/contract — this
 *    preserves both custom (non-catalog) problems and contestants who
 *    intentionally submit a complete program;
 *  - a source with no `main()` requires a registered class-method
 *    contract for its slug; when one exists, the generated harness is
 *    appended;
 *  - a source with no `main()` and no contract is reported so the caller
 *    can fail fast with a clear configuration error *before* touching
 *    Docker — never silently compiled into a missing-main linker error.
 */
export function wrapCppSubmission(sourceCode: string, problemSlug?: string): CppWrapResult {
  if (hasCppMain(sourceCode)) {
    return { kind: "standalone", sourceCode };
  }

  const contract = problemSlug ? getCppContract(problemSlug) : undefined;
  if (!contract) {
    return { kind: "missing_contract", slug: problemSlug };
  }

  const harness = buildCppHarnessSource(contract, sourceCode);
  return { kind: "wrapped", sourceCode: `${sourceCode}\n${harness}` };
}
