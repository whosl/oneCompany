import { z } from "zod";

/**
 * Shape of a project-level MCP server configuration (API-facing, camelCase).
 *
 * Only `local` (stdio) transport is supported. Remote (SSE/HTTP) MCP is not
 * wired into the opencode injection path yet, so the schema rejects it to
 * avoid a declared-but-nonfunctional config.
 */
export const ProjectMcpConfigSchema = z.object({
  serverId: z.string().min(1),
  displayName: z.string().min(1),
  transport: z.literal("local"),
  /** The command array, e.g. ["codegraph", "serve", "--mcp"]. */
  command: z.array(z.string()).min(1),
  /** Environment variables to pass to the MCP server process. */
  env: z.record(z.string()).optional(),
  /** Tool allowlist; null means passthrough (expose all tools).
   * Note: only honored on the structured-agent (callIntegrationTool) path;
   * opencode direct-connect cannot enforce it, so allowlisted servers are
   * excluded from opencode injection. */
  toolAllowlist: z.array(z.string()).nullable().optional(),
  enabled: z.boolean().default(true),
});

export type ProjectMcpConfig = z.infer<typeof ProjectMcpConfigSchema>;
