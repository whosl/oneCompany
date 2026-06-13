import { Hono } from "hono";
import { ProjectMcpConfigSchema } from "@oc/shared";
import type { Db } from "@oc/shared";
import {
  listProjectMcpConfigs,
  getProjectMcpConfig,
  upsertProjectMcpConfig,
  deleteProjectMcpConfig,
} from "@oc/integrations";

export function createProjectMcpRoutes(db: Db, getProjectId: (id: string) => boolean) {
  const router = new Hono();

  // List MCP servers for a project
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
    upsertProjectMcpConfig(db, projectId, parsed.data);
    return c.json(parsed.data, 201);
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
    upsertProjectMcpConfig(db, projectId, parsed.data);
    return c.json(parsed.data);
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
    return c.json({ deleted: serverId });
  });

  return router;
}
