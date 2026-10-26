import { describe, expect, it } from "vitest";
import { cleanSecret } from "@codearena/config";
import { extractJsonObject } from "./ai.js";
import { sanitizeHint } from "../services/ai.service.js";

describe("AI helpers (no infrastructure needed)", () => {
  it("cleans pasted secrets", () => {
    expect(cleanSecret("sk-ant-abc\n")).toBe("sk-ant-abc");
    expect(cleanSecret('  "sk-ant-abc"  ')).toBe("sk-ant-abc");
    expect(cleanSecret("   ")).toBeUndefined();
    expect(cleanSecret(undefined)).toBeUndefined();
  });

  it("extracts a JSON object from prose", () => {
    expect(extractJsonObject('Here you go: {"a": 1, "b": [2]} done')).toEqual({ a: 1, b: [2] });
    expect(extractJsonObject("no json here")).toBeUndefined();
    expect(extractJsonObject("{broken")).toBeUndefined();
  });

  it("removes code blocks from hints, including unterminated ones", () => {
    expect(sanitizeHint("Idea.\n```js\nlet x = 1;\n```\nMore.")).toBe("Idea.\n\nMore.");
    expect(sanitizeHint("Idea.\n```py\nx = 1")).toBe("Idea.");
    expect(sanitizeHint("a".repeat(2000)).length).toBeLessThanOrEqual(1501);
  });
});
