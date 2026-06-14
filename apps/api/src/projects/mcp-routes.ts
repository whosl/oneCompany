import { Hono } from "hono";
import { ProjectMcpConfigSchema, type Db } from "@oc/shared";
import {
  listProjectMcpConfigs,
  getProjectMcpConfig,
  upsertProjectMcpConfig,
  deleteProjectMcpConfig,
  getMcpPreset,
} from "@oc/integrations";

/**
 * Project MCP routes.
 *
 * SECURITY: the API only accepts a vetted `presetId` (mapped server-side to a
 * locked command), `secretRefs` (env-var name references — never secret values),
 * and `enabled`. No raw command is ever accepted, closing the arbitrary-code
 * bypass (node -e, sh -c, …). The presetId check also rejects the reserved
 * oc-* namespace since no preset uses that prefix.
 */
export function createProjectMcpRoutes(
  db: Db,
  getProjectId: (id: string) => boolean,
  /** Called after any config mutation so callers can flush cached MCP servers. */
  onConfigChange?: (projectId: string) => void | Promise<void>,
) {
  const router = new Hono();

  // List MCP servers for a project (no secret values returned)
  router.get("/:id/mcp", (c) => {
    const projectId = c.req.param("id");
    if (!getProjectId(projectId)) {
      return c.json({ error: "project not found" }, 404);
    }
    return c.json({ servers: listProjectMcpConfigs(db, projectId) });
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
    // presetId must exist in the vetted registry — this rejects unknown ids,
    // oc-* namespace collisions, and any attempt to supply a custom command.
    if (!getMcpPreset(parsed.data.presetId)) {
      return c.json({ error: `unknown presetId "${parsed.data.presetId}"` }, 400);
    }
    upsertProjectMcpConfig(db, projectId, parsed.data);
    await onConfigChange?.(projectId);
    return c.json(parsed.data, 201);
  });

  // Toggle / update a specific server (serverId in path is the presetId)
  router.patch("/:id/mcp/:serverId", async (c) => {
    const projectId = c.req.param("id");
    const serverId = c.req.param("serverId");
    const existing = getProjectMcpConfig(db, projectId, serverId);
    if (!existing) {
      return c.json({ error: "MCP server not found" }, 404);
    }
    const body = await c.req.json().catch(() => null);
    // Merge body over existing, but presetId is immutable via PATCH (locked
    // to the path param) so a body cannot reassign it to a reserved namespace.
    const merged = { ...existing, ...(body as Record<string, unknown>), presetId: serverId };
    const parsed = ProjectMcpConfigSchema.safeParse(merged);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid config" }, 400);
    }
    upsertProjectMcpConfig(db, projectId, parsed.data);
    await onConfigChange?.(projectId);
    return c.json(parsed.data);
  });

  // Remove an MCP server
  router.delete("/:id/mcp/:serverId", async (c) => {
    const projectId = c.req.param("id");
    const serverId = c.req.param("serverId");
    const existing = getProjectMcpConfig(db, projectId, serverId);
    if (!existing) {
      return c.json({ error: "MCP server not found" }, 404);
    }
    deleteProjectMcpConfig(db, projectId, serverId);
    await onConfigChange?.(projectId);
    return c.json({ deleted: serverId });
  });

  return router;
}
