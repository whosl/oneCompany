import { execFileSync } from "node:child_process";
import type { ProjectMcpConfig } from "@oc/shared";

/**
 * Default MCP servers preset for every new project. Each entry carries an
 * `available` probe so we can mark unavailable servers enabled=false instead
 * of failing project creation (silent skip per the configured behavior).
 *
 * NOTE: commands here must also be vetted in mcp-governance.ts (VETTED_MCP_COMMANDS
 * / VETTED_NPX_PACKAGES) — the preset bypasses API validation but the governance
 * layer is the single source of truth for what may run.
 */
export const PRESET_MCP_SERVERS: ReadonlyArray<
  ProjectMcpConfig & { available: boolean }
> = [
  {
    serverId: "codegraph",
    displayName: "CodeGraph",
    transport: "local",
    command: ["codegraph", "serve", "--mcp"],
    toolAllowlist: null,
    enabled: true,
    available: isCommandAvailable("codegraph"),
  },
  {
    serverId: "context7",
    displayName: "Context7 (library docs)",
    transport: "local",
    command: ["npx", "--yes", "@upstash/context7-mcp"],
    toolAllowlist: null,
    enabled: true,
    available: isNpxAvailable(),
  },
  {
    serverId: "web-search",
    displayName: "Brave Web Search",
    transport: "local",
    // The official MCP search server; requires BRAVE_API_KEY env. Replaces the
    // earlier @anthropic/web-search-mcp which does not exist on npm (E404).
    command: ["npx", "--yes", "@modelcontextprotocol/server-brave-search"],
    toolAllowlist: null,
    env: {},
    enabled: true,
    available: isNpxAvailable(),
  },
];

/** Check whether a bare executable resolves on PATH (no shell). */
function isCommandAvailable(command: string): boolean {
  try {
    execFileSync("command", ["-v", command], { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

/** npx ships with npm; treat its presence as the proxy availability signal. */
function isNpxAvailable(): boolean {
  return isCommandAvailable("npx");
}

/**
 * Resolve the preset servers for a project: each gets enabled = available, so
 * missing tooling degrades to enabled=false rather than throwing.
 */
export function resolvePresetMcpServers(): ProjectMcpConfig[] {
  return PRESET_MCP_SERVERS.map((server) => ({
    serverId: server.serverId,
    displayName: server.displayName,
    transport: server.transport,
    command: server.command,
    toolAllowlist: server.toolAllowlist,
    enabled: server.available,
  }));
}
