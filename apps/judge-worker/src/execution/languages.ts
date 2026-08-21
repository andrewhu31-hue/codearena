import type { Language } from "@codearena/shared";

export interface LanguageConfig {
  /** Pinned to a minor version, not a digest — see docs/judge-security.md limitations. */
  image: string;
  sourceFilename: string;
  needsCompile: boolean;
  compileCommand?: string[];
  runCommand: string[];
}

export const LANGUAGE_CONFIG: Record<Language, LanguageConfig> = {
  PYTHON: {
    image: "python:3.12-slim",
    sourceFilename: "solution.py",
    needsCompile: false,
    runCommand: ["python3", "/workspace/solution.py"],
  },
  JAVASCRIPT: {
    image: "node:20-slim",
    sourceFilename: "solution.js",
    needsCompile: false,
    runCommand: ["node", "/workspace/solution.js"],
  },
  CPP: {
    image: "gcc:13",
    sourceFilename: "solution.cpp",
    needsCompile: true,
    compileCommand: [
      "g++",
      "-O2",
      "-std=c++17",
      "-o",
      "/workspace/solution",
      "/workspace/solution.cpp",
    ],
    runCommand: ["/workspace/solution"],
  },
};
