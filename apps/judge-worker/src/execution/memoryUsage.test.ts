import { describe, expect, it } from "vitest";
import { parseDockerMemUsageKb } from "./memoryUsage.js";

describe("parseDockerMemUsageKb", () => {
  it("parses MiB", () => {
    expect(parseDockerMemUsageKb("12.34MiB / 512MiB")).toBe(Math.round(12.34 * 1024));
  });

  it("parses GiB", () => {
    expect(parseDockerMemUsageKb("1GiB / 2GiB")).toBe(1024 * 1024);
  });

  it("parses bytes", () => {
    expect(parseDockerMemUsageKb("512B / 512MiB")).toBe(1); // 0.5KB rounded
  });

  it("parses KiB", () => {
    expect(parseDockerMemUsageKb("256KiB / 512MiB")).toBe(256);
  });

  it("returns null for malformed input", () => {
    expect(parseDockerMemUsageKb("not a number")).toBeNull();
    expect(parseDockerMemUsageKb("")).toBeNull();
  });
});
