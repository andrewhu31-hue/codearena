import { renderCppStarterTemplate, type CppContract } from "@codearena/shared";
import type { ReferenceImplementation } from "./referenceSolutions.js";

const EMPTY_STUB_BODY = "{\n        \n    }";

function indent(code: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}

/**
 * Takes the *actual* rendered starter template for a contract and replaces
 * only the empty method body/bodies with a correct implementation — this
 * is exactly what a contestant does, so the resulting source exercises the
 * real displayed template rather than a hand-assembled stand-in. When the
 * problem needs shared state across calls (Trie/WordDictionary), a
 * `private:` member section is inserted before the class's closing brace,
 * exactly as a contestant solving those problems would add one themselves.
 */
export function buildReferenceSubmission(
  contract: CppContract,
  impl: ReferenceImplementation,
): string {
  const template = renderCppStarterTemplate(contract);

  if (impl.methodBodies.length !== contract.methods.length) {
    throw new Error(
      `reference implementation for '${contract.slug}' has ${impl.methodBodies.length} bodies, contract declares ${contract.methods.length} methods`,
    );
  }

  let cursor = 0;
  let result = "";
  for (const body of impl.methodBodies) {
    const idx = template.indexOf(EMPTY_STUB_BODY, cursor);
    if (idx === -1) {
      throw new Error(
        `could not find an empty method stub to fill for '${contract.slug}' (template/registry mismatch?)`,
      );
    }
    result += template.slice(cursor, idx);
    result += `{\n${indent(body, 8)}\n    }`;
    cursor = idx + EMPTY_STUB_BODY.length;
  }
  result += template.slice(cursor);

  if (impl.memberFields) {
    const closingBrace = result.lastIndexOf("};");
    if (closingBrace === -1) {
      throw new Error(`could not find class closing brace for '${contract.slug}'`);
    }
    const fieldsBlock = `\nprivate:\n${indent(impl.memberFields, 4)}\n`;
    result = result.slice(0, closingBrace) + fieldsBlock + result.slice(closingBrace);
  }

  return result;
}
