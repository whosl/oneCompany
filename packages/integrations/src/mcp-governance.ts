/**
 * Governance for project-level MCP server commands.
 *
 * OneCompany's core principle is "the LLM is untrusted" — every tool the agent
 * can invoke must pass through command risk classification, gates, and
 * sandboxing. Arbitrary user-supplied `command` arrays would let an MCP entry
 * spawn any process (e.g. `["sh","-c","..."]`) outside that governance, so
 * project MCP commands are restricted to a vetted registry.
 *
 * To add a new MCP server, register its command shape here. This mirrors how
 * P1 integration definitions (p1-definitions.ts) are a closed, reviewed set
 * rather than open user input.
 */

/** Reserved namespace: serverIds starting with this prefix cannot be user-set. */
export const RESERVED_MCP_PREFIX = "oc-";

export interface VettedMcpCommand {
  /** The command array must match this prefix (first element). */
  commandHead: string;
  /** Human-readable reason for vetting, shown in error messages. */
  description: string;
}

/**
 * Vetted command heads. A project MCP's command[0] must appear here, and the
 * full command must be a prefix-extension of a vetted entry (e.g. codegraph
 * serve --mcp is fine; codegraph serve --mcp && rm -rf is not, because the
 * shell metachar would be a separate argv element only via sh -c, which codegraph
 * is not).
 */
export const VETTED_MCP_COMMANDS: readonly VettedMcpCommand[] = [
  { commandHead: "codegraph", description: "CodeGraph code intelligence MCP" },
  { commandHead: "npx", description: "npm package executor (for vetted MCP packages)" },
  { commandHead: "node", description: "Node.js script executor" },
];

/** Vetted npx package patterns — npx is allowed but only for these packages. */
export const VETTED_NPX_PACKAGES: readonly string[] = [
  "@upstash/context7-mcp",
  "@modelcontextprotocol/server-brave-search",
];

/** True if a serverId collides with the reserved oc-* namespace. */
export function isReservedServerId(serverId: string): boolean {
  return serverId.toLowerCase().startsWith(RESERVED_MCP_PREFIX);
}

/**
 * Validate a project MCP command against the vetted registry.
 * Returns an error message string if rejected, or undefined if allowed.
 */
export function validateMcpCommand(
  command: string[] | undefined,
): string | undefined {
  if (!command || command.length === 0) {
    return "command is required for local transport";
  }
  const head = command[0];
  if (!head) {
    return "command[0] is empty";
  }

  // Reject any attempt to invoke a shell — these bypass all governance.
  const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "fish", "/bin/sh", "/bin/bash"]);
  if (SHELL_BINARIES.has(head)) {
    return `shell interpreters (${head}) are not permitted; MCP servers run as direct processes`;
  }

  // Command head must be vetted.
  const vetted = VETTED_MCP_COMMANDS.find((v) => v.commandHead === head);
  if (!vetted) {
    const allowed = VETTED_MCP_COMMANDS.map((v) => v.commandHead).join(", ");
    return `command "${head}" is not in the vetted MCP registry (allowed: ${allowed})`;
  }

  // npx: the package name (first arg after flags) must be vetted.
  if (head === "npx") {
    const pkgArg = command.find((arg, i) => i > 0 && !arg.startsWith("-"));
    if (!pkgArg) {
      return "npx command must specify a package name";
    }
    if (!VETTED_NPX_PACKAGES.includes(pkgArg)) {
      return `npx package "${pkgArg}" is not vetted; allowed: ${VETTED_NPX_PACKAGES.join(", ")}`;
    }
  }

  return undefined;
}

/**
 * Reject serverIds that would shadow the governance gateway or reserved names.
 */
export function validateMcpServerId(serverId: string): string | undefined {
  if (isReservedServerId(serverId)) {
    return `serverId "${serverId}" is reserved (the ${RESERVED_MCP_PREFIX}* namespace is governed by OneCompany)`;
  }
  return undefined;
}
