import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // IO-heavy suites (drizzle-kit push, git init, agent registration) exceed the
    // 5s default under concurrent Turbo runs on cold cache; give them headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
