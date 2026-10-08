import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Each test file boots its own PocketBase (test/harness/pocketbase.ts).
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
