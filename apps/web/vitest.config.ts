import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**"],
    environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
