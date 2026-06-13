import { z } from "zod";

/** Transport for a project-level MCP server. */
export const ProjectMcpTransportSchema = z.enum(["local", "remote"]);

/** Shape of a project-level MCP server configuration (API-facing, camelCase). */
export const ProjectMcpConfigSchema = z.object({
  serverId: z.string().min(1),
  displayName: z.string().min(1),
  transport: ProjectMcpTransportSchema,
  /** For local transport: the command array, e.g. ["codegraph", "serve", "--mcp"]. */
  command: z.array(z.string()).optional(),
  /** For remote transport: the server URL. */
  url: z.string().optional(),
  /** Environment variables to pass to the MCP server process. */
  env: z.record(z.string()).optional(),
  /** Working directory for the MCP server process. */
  cwd: z.string().optional(),
  /** Tool allowlist; null/undefined means passthrough (expose all tools). */
  toolAllowlist: z.array(z.string()).nullable().optional(),
  enabled: z.boolean().default(true),
});

export type ProjectMcpConfig = z.infer<typeof ProjectMcpConfigSchema>;
export type ProjectMcpTransport = z.infer<typeof ProjectMcpTransportSchema>;
