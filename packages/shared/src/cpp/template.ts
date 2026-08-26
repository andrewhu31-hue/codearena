import type { CppContract, CppMethodSignature, CppType } from "./types.js";
import { STRUCT_TEXT_BY_NAME, requiredStructNames } from "./structs.js";

/** Every type mentioned anywhere in a contract's method signatures. */
export function contractTypes(methods: CppMethodSignature[]): CppType[] {
  const types = new Set<CppType>();
  for (const m of methods) {
    types.add(m.returnType);
    for (const p of m.params) types.add(p.type);
  }
  return [...types];
}

const BY_VALUE_TYPES = new Set<CppType>(["int", "bool", "uint32_t", "string"]);

function renderParam(p: { name: string; type: CppType }): string {
  // int/bool/uint32_t/string and pointer types are passed by value/as a raw
  // pointer, matching real LeetCode convention (see the existing two-sum /
  // reverse-string contracts); only container types (vector<...>) take '&'.
  if (BY_VALUE_TYPES.has(p.type) || p.type.endsWith("*")) {
    return `${p.type} ${p.name}`;
  }
  return `${p.type}& ${p.name}`;
}

function renderMethodStub(m: CppMethodSignature): string {
  const renderedParams = m.params.map(renderParam).join(", ");
  return `    ${m.returnType} ${m.name}(${renderedParams}) {\n        \n    }`;
}

/**
 * Renders the exact C++ starter template shown in the editor for a given
 * contract — the single source the judge harness generator also derives
 * its expectations from, so template and harness can never drift apart.
 */
export function renderCppStarterTemplate(contract: CppContract): string {
  const structs = requiredStructNames(contractTypes(contract.methods)).map(
    (name) => STRUCT_TEXT_BY_NAME[name],
  );
  const stubs = contract.methods.map(renderMethodStub).join("\n\n");

  const parts = [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "",
    ...(structs.length > 0 ? [structs.join("\n\n"), ""] : []),
    "class Solution {",
    "public:",
    stubs,
    "};",
    "",
  ];

  return parts.join("\n");
}

/**
 * Generic fallback shown only for a slug with no registered contract (e.g.
 * a future custom/non-catalog problem). Deliberately a standalone-program
 * shape, not a class stub — an unregistered class-only submission has no
 * adapter to generate a harness with, so guiding the contestant toward a
 * plain `main()` is what will actually compile and run.
 */
export const CPP_STANDALONE_FALLBACK_TEMPLATE =
  "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n";
