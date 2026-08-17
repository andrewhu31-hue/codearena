import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration suites share one real Postgres/Redis (see README) and
    // reset it in beforeEach; running files in parallel causes one file's
    // reset to wipe another's fixtures mid-test.
    fileParallelism: false,
  },
});
