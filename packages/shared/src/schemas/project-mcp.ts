import { z } from "zod";

/**
 * API-facing shape for a project-level MCP server configuration.
 *
 * SECURITY MODEL: the API never accepts a raw `command[]`. Callers select a
 * vetted `presetId`; the server maps it to a locked, full command. This closes
 * the "node -e / arbitrary script" bypass that checking command[0] cannot
 * prevent. Only `enabled` and `secretRefs` (env-var name references, never
 * secret values) are user-settable.
 */
export const ProjectMcpConfigSchema = z.object({
  /** Reference to a vetted preset in the server-side registry. */
  presetId: z.string().min(1),
  /** Human-readable label (defaults to the preset's display name). */
  displayName: z.string().min(1),
  /**
   * Environment-variable references for secrets the MCP server needs.
   * Maps TARGET_ENV_NAME -> SOURCE_ENV_NAME (read from process.env at spawn).
   * Secret VALUES are never persisted; only the reference is stored.
   * Example: { "BRAVE_API_KEY": "BRAVE_API_KEY" }
   */
  secretRefs: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

export type ProjectMcpConfig = z.infer<typeof ProjectMcpConfigSchema>;
