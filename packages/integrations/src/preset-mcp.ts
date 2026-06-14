import { execFileSync } from "node:child_process";
import type { ProjectMcpConfig } from "@oc/shared";

/**
 * Server-side registry of vetted MCP presets. Each preset has a LOCKED,
 * version-pinned command — the API never accepts user-supplied command arrays,
 * so there is no way to inject `node -e`, arbitrary script paths, or shell
 * metacharacters. To add a new MCP, register it here (code review required).
 *
 * `available` is probed at preset time so missing tools degrade to
 * enabled=false instead of failing project creation.
 */
export interface VettedMcpPreset {
  presetId: string;
  displayName: string;
  /** Locked, full command — no user interpolation. */
  command: readonly string[];
  /**
   * Env-var names this preset may read from process.env at spawn.
   * The DB stores references (TARGET -> SOURCE); values come from the runtime
   * environment, never from the database.
   */
  allowedSecretKeys: readonly string[];
  available: boolean;
}

/** Check whether a bare executable resolves on PATH (no shell). */
function isCommandAvailable(command: string): boolean {
  try {
    execFileSync("command", ["-v", command], { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

function isNpxAvailable(): boolean {
  return isCommandAvailable("npx");
}

export const VETTED_MCP_PRESETS: readonly VettedMcpPreset[] = [
  {
    presetId: "codegraph",
    displayName: "CodeGraph",
    command: ["codegraph", "serve", "--mcp"],
    allowedSecretKeys: [],
    available: isCommandAvailable("codegraph"),
  },
  {
    presetId: "context7",
    displayName: "Context7 (library docs)",
    // Version-pinned to prevent supply-chain drift via npx latest resolution.
    command: ["npx", "--yes", "@upstash/context7-mcp@3.2.1"],
    allowedSecretKeys: [],
    available: isNpxAvailable(),
  },
  {
    presetId: "web-search",
    displayName: "Web Search (Tavily)",
    // Tavily MCP — AI-oriented web search. Requires TAVILY_API_KEY env.
    command: ["npx", "--yes", "tavily-mcp@0.2.20"],
    allowedSecretKeys: ["TAVILY_API_KEY"],
    available: isNpxAvailable(),
  },
];

/** Look up a preset by id. */
export function getMcpPreset(presetId: string): VettedMcpPreset | undefined {
  return VETTED_MCP_PRESETS.find((p) => p.presetId === presetId);
}

/**
 * Resolve the preset servers for a freshly created project: each gets
 * enabled = available, with empty secretRefs.
 */
export function resolvePresetMcpServers(): ProjectMcpConfig[] {
  return VETTED_MCP_PRESETS.map((preset) => ({
    presetId: preset.presetId,
    displayName: preset.displayName,
    secretRefs: {},
    enabled: preset.available,
  }));
}
