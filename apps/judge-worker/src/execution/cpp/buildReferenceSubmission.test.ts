import { describe, expect, it } from "vitest";
import { CPP_CONTRACT_REGISTRY, CANONICAL_75_SLUGS } from "@codearena/shared";
import { REFERENCE_IMPLEMENTATIONS } from "./referenceSolutions.js";
import { buildReferenceSubmission } from "./buildReferenceSubmission.js";
import { hasCppMain, wrapCppSubmission } from "./generate.js";

describe("buildReferenceSubmission", () => {
  it("has a reference implementation for every one of the 75 canonical slugs", () => {
    for (const slug of CANONICAL_75_SLUGS) {
      expect(REFERENCE_IMPLEMENTATIONS[slug], slug).toBeDefined();
    }
  });

  it("builds a class-only source (no main) for every one of the 75 contracts", () => {
    for (const slug of CANONICAL_75_SLUGS) {
      const contract = CPP_CONTRACT_REGISTRY[slug];
      const impl = REFERENCE_IMPLEMENTATIONS[slug];
      const source = buildReferenceSubmission(contract, impl);
      expect(hasCppMain(source), slug).toBe(false);
      expect(source, slug).toContain("class Solution");
    }
  });

  it("produces a fully-wrapped, single-main source when run through wrapCppSubmission", () => {
    for (const slug of CANONICAL_75_SLUGS) {
      const contract = CPP_CONTRACT_REGISTRY[slug];
      const impl = REFERENCE_IMPLEMENTATIONS[slug];
      const source = buildReferenceSubmission(contract, impl);
      const result = wrapCppSubmission(source, slug);
      expect(result.kind, slug).toBe("wrapped");
      if (result.kind === "wrapped") {
        const mainCount = (result.sourceCode.match(/\bint\s+main\s*\(/g) ?? []).length;
        expect(mainCount, slug).toBe(1);
      }
    }
  });

  it("inserts a private member section for stateful operation-sequence contracts", () => {
    const contract = CPP_CONTRACT_REGISTRY["implement-trie-prefix-tree"];
    const impl = REFERENCE_IMPLEMENTATIONS["implement-trie-prefix-tree"];
    const source = buildReferenceSubmission(contract, impl);
    expect(source).toContain("private:");
    expect(source).toContain("unordered_set<string> words;");
  });
});
