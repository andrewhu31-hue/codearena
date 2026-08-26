import { describe, expect, it } from "vitest";
import { validateCppRegistry } from "./validate.js";
import { CPP_CONTRACT_REGISTRY } from "./registry.js";
import { CANONICAL_75_SLUGS } from "./manifest.js";

describe("C++ contract registry", () => {
  it("passes full completeness validation", () => {
    const result = validateCppRegistry();
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("has exactly 75 canonical slugs", () => {
    expect(CANONICAL_75_SLUGS.length).toBe(75);
    expect(new Set(CANONICAL_75_SLUGS).size).toBe(75);
  });

  it("has exactly 75 contracts, one per canonical slug", () => {
    const keys = Object.keys(CPP_CONTRACT_REGISTRY);
    expect(keys.length).toBe(75);
    for (const slug of CANONICAL_75_SLUGS) {
      expect(CPP_CONTRACT_REGISTRY[slug]).toBeDefined();
    }
  });

  it("every contract uses className Solution and at least one method", () => {
    for (const contract of Object.values(CPP_CONTRACT_REGISTRY)) {
      expect(contract.className).toBe("Solution");
      expect(contract.methods.length).toBeGreaterThan(0);
    }
  });

  it("keeps two-sum and binary-search contracts unchanged", () => {
    expect(CPP_CONTRACT_REGISTRY["two-sum"]).toEqual({
      slug: "two-sum",
      className: "Solution",
      family: "vecInt_target_to_vecInt",
      methods: [
        {
          name: "twoSum",
          params: [
            { name: "nums", type: "vector<int>" },
            { name: "target", type: "int" },
          ],
          returnType: "vector<int>",
        },
      ],
    });
    expect(CPP_CONTRACT_REGISTRY["binary-search"].methods[0]?.name).toBe("search");
  });
});
