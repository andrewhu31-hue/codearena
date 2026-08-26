import { CANONICAL_75_SLUGS } from "./manifest.js";
import { CPP_CONTRACT_REGISTRY } from "./registry.js";
import { CPP_FAMILIES } from "./types.js";

export interface CppRegistryValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the C++ contract registry against the canonical 75-slug
 * manifest: exactly 75 canonical slugs, exactly 75 contracts, no
 * duplicates, no contract for an unknown slug, no canonical slug missing a
 * contract, and no contract using an unrecognized family.
 */
export function validateCppRegistry(): CppRegistryValidationResult {
  const errors: string[] = [];

  const canonicalSet = new Set<string>(CANONICAL_75_SLUGS);
  if (canonicalSet.size !== 75) {
    errors.push(`canonical manifest must have exactly 75 unique slugs, found ${canonicalSet.size}`);
  }
  if (CANONICAL_75_SLUGS.length !== canonicalSet.size) {
    errors.push("canonical manifest contains duplicate slugs");
  }

  const registryKeys = Object.keys(CPP_CONTRACT_REGISTRY);
  const registrySet = new Set(registryKeys);
  if (registryKeys.length !== registrySet.size) {
    errors.push("CPP_CONTRACT_REGISTRY contains duplicate slug keys");
  }
  if (registrySet.size !== 75) {
    errors.push(`CPP_CONTRACT_REGISTRY must have exactly 75 contracts, found ${registrySet.size}`);
  }

  for (const slug of canonicalSet) {
    if (!registrySet.has(slug)) {
      errors.push(`canonical slug '${slug}' has no C++ contract`);
    }
  }
  for (const slug of registrySet) {
    if (!canonicalSet.has(slug)) {
      errors.push(`C++ contract '${slug}' is not a canonical seeded slug`);
    }
  }

  const familySet = new Set<string>(CPP_FAMILIES);
  for (const [slug, contract] of Object.entries(CPP_CONTRACT_REGISTRY)) {
    if (contract.slug !== slug) {
      errors.push(`contract keyed under '${slug}' has mismatched internal slug '${contract.slug}'`);
    }
    if (!familySet.has(contract.family)) {
      errors.push(`contract '${slug}' uses unknown family '${contract.family}'`);
    }
    if (contract.className !== "Solution") {
      errors.push(`contract '${slug}' must use className 'Solution', got '${contract.className}'`);
    }
    if (contract.methods.length === 0) {
      errors.push(`contract '${slug}' declares zero methods`);
    }
    for (const m of contract.methods) {
      if (!m.name) errors.push(`contract '${slug}' has a method with an empty name`);
    }
  }

  return { valid: errors.length === 0, errors };
}
