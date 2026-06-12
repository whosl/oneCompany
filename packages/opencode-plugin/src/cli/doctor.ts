import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPENCODE_VERSION_RANGE, PLUGIN_ID, resolveApiUrl } from "../shared/config.js";
import { checkSidecarHealth } from "../shared/sidecar.js";

export async function doctor(): Promise<void> {
  const apiUrl = resolveApiUrl();
  const distRoot = path.dirname(fileURLToPath(import.meta.url));

  console.log(`OneCompany plugin doctor (${PLUGIN_ID})`);
  console.log(`  OpenCode compatibility: ${OPENCODE_VERSION_RANGE}`);
  console.log(`  Sidecar URL: ${apiUrl}`);

  const built = fs.existsSync(path.join(distRoot, "server.js"));
  console.log(`  Plugin build: ${built ? "ok" : "MISSING — pnpm --filter @onecompany/opencode build"}`);

  try {
    const version = execSync("opencode --version", { encoding: "utf8" }).trim();
    console.log(`  opencode CLI: ${version}`);
  } catch {
    console.log("  opencode CLI: not found (install opencode or mimo)");
  }

  const health = await checkSidecarHealth(apiUrl);
  console.log(
    `  Sidecar /health: ${health.ok ? "ok" : "DOWN — run: onecompany daemon or pnpm api"}`,
  );
  if (health.plugin) {
    console.log(`  Sidecar /plugin/health: ${health.plugin.ok ? "ok" : "missing"} v${health.plugin.version ?? "?"}`);
  }

  const packageRoot = path.resolve(distRoot, "..");
  const tuiSource = path.join(packageRoot, "src/tui/index.tsx");
  console.log(`  TUI source: ${fs.existsSync(tuiSource) ? "ok" : "MISSING"}`);

  const localOpencode = path.join(process.cwd(), ".opencode", "opencode.json");
  const localTui = path.join(process.cwd(), ".opencode", "tui.json");
  console.log(`  Local .opencode/opencode.json: ${fs.existsSync(localOpencode) ? "present" : "absent"}`);
  console.log(`  Local .opencode/tui.json: ${fs.existsSync(localTui) ? "present" : "absent"}`);

  if (fs.existsSync(localTui)) {
    try {
      const tuiConfig = JSON.parse(fs.readFileSync(localTui, "utf8")) as { plugin?: unknown[] };
      const entries = Array.isArray(tuiConfig.plugin) ? tuiConfig.plugin : [];
      const usesBuiltTui = entries.some((entry) => stringify(entry).includes("/dist/tui.js"));
      if (usesBuiltTui) {
        console.log(
          "  TUI config: WARNING — points to dist/tui.js (broken JSX). Run: pnpm opencode-plugin:install",
        );
      } else if (entries.some((entry) => stringify(entry).includes("index.tsx"))) {
        console.log("  TUI config: ok (source .tsx)");
      }
    } catch {
      /* ignore */
    }
  }
}

function stringify(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry)) return JSON.stringify(entry);
  return String(entry);
}
