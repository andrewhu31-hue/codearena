import { describe, expect, it } from "vitest";
import { outputsMatch } from "./outputCompare.js";

describe("outputsMatch", () => {
  it("matches identical output", () => {
    expect(outputsMatch("hello\n", "hello\n")).toBe(true);
  });

  it("ignores a missing/extra trailing newline", () => {
    expect(outputsMatch("hello", "hello\n")).toBe(true);
    expect(outputsMatch("hello\n\n\n", "hello")).toBe(true);
  });

  it("ignores trailing whitespace on each line", () => {
    expect(outputsMatch("1 2 3   \n4 5 6", "1 2 3\n4 5 6   ")).toBe(true);
  });

  it("normalizes CRLF to LF", () => {
    expect(outputsMatch("a\r\nb\r\n", "a\nb\n")).toBe(true);
  });

  it("does not ignore internal whitespace differences", () => {
    expect(outputsMatch("1  2", "1 2")).toBe(false);
  });

  it("rejects genuinely different output", () => {
    expect(outputsMatch("0 1", "1 2")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(outputsMatch("Yes", "yes")).toBe(false);
  });
});
