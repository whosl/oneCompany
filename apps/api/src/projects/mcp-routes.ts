import { Hono } from "hono";
import { ProjectMcpConfigSchema, type Db } from "@oc/shared";
import {
  listProjectMcpConfigs,
  getProjectMcpConfig,
  upsertProjectMcpConfig,
  deleteProjectMcpConfig,
  validateMcpCommand,
  validateMcpServerId,
} from "@oc/integrations";

/** Strip env values from configs returned over the API — secrets must not leak. */
function redactEnv<T extends { env?: Record<string, string> }>(config: T): T {
  if (!config.env) return config;
  const redacted: Record<string, string> = {};
  for (const key of Object.keys(config.env)) {
    redacted[key] = "***";
  }
  return { ...config, env: redacted };
}

export function createProjectMcpRoutes(
  db: Db,
  getProjectId: (id: string) => boolean,
  /** Called after any config mutation so callers can flush cached MCP servers. */
  onConfigChange?: (projectId: string) => void,
) {
  const router = new Hono();

  // List MCP servers for a project (env values redacted)
  router.get("/:id/mcp", (c) => {
    const projectId = c.req.param("id");
    if (!getProjectId(projectId)) {
      return c.json({ error: "project not found" }, 404);
    }
    const servers = listProjectMcpConfigs(db, projectId).map(redactEnv);
    return c.json({ servers });
  });

  // Add or update an MCP server
  router.post("/:id/mcp", async (c) => {
    const projectId = c.req.param("id");
    if (!getProjectId(projectId)) {
      return c.json({ error: "project not found" }, 404);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = ProjectMcpConfigSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid config" }, 400);
    }
    // Governance: reject reserved serverIds and unvetted commands.
    const idError = validateMcpServerId(parsed.data.serverId);
    if (idError) return c.json({ error: idError }, 400);
    const cmdError = validateMcpCommand(parsed.data.command);
    if (cmdError) return c.json({ error: cmdError }, 400);

    upsertProjectMcpConfig(db, projectId, parsed.data);
    onConfigChange?.(projectId);
    return c.json(redactEnv(parsed.data), 201);
  });

  // Toggle / update a specific server
  router.patch("/:id/mcp/:serverId", async (c) => {
    const projectId = c.req.param("id");
    const serverId = c.req.param("serverId");
    const existing = getProjectMcpConfig(db, projectId, serverId);
    if (!existing) {
      return c.json({ error: "MCP server not found" }, 404);
    }
    const body = await c.req.json().catch(() => null);
    const merged = { ...existing, ...(body as Record<string, unknown>) };
    const parsed = ProjectMcpConfigSchema.safeParse(merged);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid config" }, 400);
    }
    // Re-validate command governance if it changed.
    const cmdError = validateMcpCommand(parsed.data.command);
    if (cmdError) return c.json({ error: cmdError }, 400);

    upsertProjectMcpConfig(db, projectId, parsed.data);
    onConfigChange?.(projectId);
    return c.json(redactEnv(parsed.data));
  });

  // Remove an MCP server
  router.delete("/:id/mcp/:serverId", (c) => {
    const projectId = c.req.param("id");
    const serverId = c.req.param("serverId");
    const existing = getProjectMcpConfig(db, projectId, serverId);
    if (!existing) {
      return c.json({ error: "MCP server not found" }, 404);
    }
    deleteProjectMcpConfig(db, projectId, serverId);
    onConfigChange?.(projectId);
    return c.json({ deleted: serverId });
  });

  return router;
}
