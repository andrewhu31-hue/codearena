// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/generated/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Plain Node scripts (not part of any TS workspace/build).
    files: ["load-tests/setup/**/*.mjs", "load-tests/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Standalone Node scripts used from CLI tooling.
    files: ["scripts/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    // k6 scenario scripts run in k6's own JS runtime, not Node or a
    // browser — __ENV/__VU/__ITER/__VU_ITER/open are k6 runtime globals.
    files: ["load-tests/scenarios/**/*.js"],
    languageOptions: {
      globals: {
        __ENV: "readonly",
        __VU: "readonly",
        __ITER: "readonly",
        __VU_ITER: "readonly",
        open: "readonly",
      },
    },
  },
);
