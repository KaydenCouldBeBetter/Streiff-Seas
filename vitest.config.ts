import { defineConfig } from "vitest/config";
import { buildDefine, buildInfo } from "./web/build-info.ts";

export default defineConfig({
  // The same constants as vite.config.ts, so app modules load under test. (That config isn't
  // merged in: its root is web/, and the tests live outside it.)
  define: buildDefine(buildInfo(process.env, new Date())),
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Each test file boots its own PocketBase (test/harness/pocketbase.ts).
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
