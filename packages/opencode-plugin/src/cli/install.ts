import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_ID } from "../shared/config.js";

type JsonRecord = Record<string, unknown>;

const ONECOMPANY_PLUGIN_MARKERS = ["opencode-plugin", "onecompany"];

export async function install(options: { global?: boolean } = {}): Promise<void> {
  const distRoot = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(distRoot, "..");
  const serverEntry = path.join(distRoot, "server.js");
  const tuiEntry = path.join(packageRoot, "src/tui/index.tsx");

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Plugin not built. Run: pnpm --filter @onecompany/opencode build`);
  }
  if (!fs.existsSync(tuiEntry)) {
    throw new Error(`TUI plugin source missing at ${tuiEntry}`);
  }

  const serverSpec = `file://${serverEntry}`;
  const tuiSpec = `file://${tuiEntry}`;
  const apiUrl = process.env.ONECOMPANY_API_URL ?? "http://127.0.0.1:3001";

  const configDir = options.global
    ? path.join(process.env.HOME ?? "~", ".config", "opencode")
    : path.join(process.cwd(), ".opencode");

  fs.mkdirSync(configDir, { recursive: true });

  const opencodePath = path.join(configDir, "opencode.json");
  const tuiPath = path.join(configDir, "tui.json");

  mergePluginConfig(opencodePath, [serverSpec], { replaceOnecompany: true });
  mergePluginConfig(tuiPath, [[tuiSpec, { apiUrl }]], { replaceOnecompany: true });

  console.log(`Installed ${PLUGIN_ID} plugins:`);
  console.log(`  server → ${opencodePath}`);
  console.log(`  tui    → ${tuiPath} (source .tsx — OpenCode compiles JSX at load)`);
  console.log(`\nNext: onecompany daemon && opencode`);
}

function isOnecompanyPluginEntry(entry: unknown): boolean {
  const text = stringifyPluginEntry(entry).toLowerCase();
  return ONECOMPANY_PLUGIN_MARKERS.some((marker) => text.includes(marker));
}

function mergePluginConfig(
  filePath: string,
  additions: unknown[],
  options: { replaceOnecompany?: boolean } = {},
): void {
  let existing: JsonRecord = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonRecord;
    } catch {
      console.warn(`Warning: could not parse ${filePath}, creating fresh config`);
    }
  }

  const prev = Array.isArray(existing.plugin) ? (existing.plugin as unknown[]) : [];
  const base = options.replaceOnecompany
    ? prev.filter((item) => !isOnecompanyPluginEntry(item))
    : [...prev];

  const merged = [...base];
  for (const entry of additions) {
    const key = stringifyPluginEntry(entry);
    if (!merged.some((item) => stringifyPluginEntry(item) === key)) {
      merged.push(entry);
    }
  }

  const next = { ...existing, plugin: merged };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function stringifyPluginEntry(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry)) return JSON.stringify(entry);
  return String(entry);
}
