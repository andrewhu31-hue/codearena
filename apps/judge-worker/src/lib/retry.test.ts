import { describe, expect, it } from "vitest";
import { hasPrismaCode, withBoundedRetry } from "./retry.js";

describe("withBoundedRetry", () => {
  it("retries transient P1001 errors and succeeds", async () => {
    let attempts = 0;
    const value = await withBoundedRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const err = new Error("can't reach database") as Error & { code: string };
          err.code = "P1001";
          throw err;
        }
        return "ok";
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 2,
        shouldRetry: (err) => hasPrismaCode(err, "P1001"),
      },
    );

    expect(value).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-transient errors", async () => {
    let attempts = 0;
    await expect(
      withBoundedRetry(
        async () => {
          attempts += 1;
          throw new Error("non transient");
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1,
          maxDelayMs: 2,
          shouldRetry: (err) => hasPrismaCode(err, "P1001"),
        },
      ),
    ).rejects.toThrow("non transient");
    expect(attempts).toBe(1);
  });
});
