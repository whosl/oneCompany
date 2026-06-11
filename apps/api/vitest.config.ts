import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Generated apps carry their own test suites; never collect them here.
    exclude: ["**/node_modules/**", "**/dist/**", "**/generated-projects/**"],
  },
});
