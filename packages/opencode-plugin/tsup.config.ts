import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server/index.ts",
    tui: "src/tui/index.tsx",
    cli: "src/cli/index.ts",
  },
  format: ["esm"],
  dts: {
    entry: { server: "src/server/index.ts", cli: "src/cli/index.ts" },
  },
  clean: true,
  external: ["@opencode-ai/plugin", "@opencode-ai/plugin/tui", "@opentui/core", "@opentui/solid"],
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.jsxImportSource = "@opentui/solid";
  },
});
