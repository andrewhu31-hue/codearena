import { describe, expect, it } from "vitest";
import { parseApiEnv } from "@codearena/config";

const base = {
  DATABASE_URL: "postgresql://x@localhost/db",
  REDIS_URL: "redis://localhost",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
};

describe("API config parsing (no infrastructure needed)", () => {
  it("keeps a single CORS origin as a string", () => {
    expect(parseApiEnv({ ...base, CORS_ORIGIN: "https://codearena.dev/" }).CORS_ORIGIN).toBe(
      "https://codearena.dev",
    );
  });

  it("splits comma-separated CORS origins", () => {
    const env = parseApiEnv({
      ...base,
      CORS_ORIGIN: "https://codearena-opal.vercel.app, https://codearena.dev ,",
    });
    expect(env.CORS_ORIGIN).toEqual(["https://codearena-opal.vercel.app", "https://codearena.dev"]);
  });

  it("treats a blank or whitespace-only AI key as unset and trims pasted keys", () => {
    expect(parseApiEnv({ ...base, ANTHROPIC_API_KEY: "  " }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(parseApiEnv({ ...base, ANTHROPIC_API_KEY: "sk-ant-x\n" }).ANTHROPIC_API_KEY).toBe(
      "sk-ant-x",
    );
    expect(parseApiEnv(base).ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
  });
});
