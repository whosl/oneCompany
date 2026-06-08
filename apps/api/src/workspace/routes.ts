import { Hono } from "hono";
import { devCommandsEnabled, type WorkspaceService } from "./service.js";

export function createWorkspaceRoutes(workspace: WorkspaceService) {
  const router = new Hono();

  router.get("/:id/files", (c) => {
    const relativePath = c.req.query("path");
    try {
      if (relativePath) {
        const file = workspace.readProjectFile(c.req.param("id"), relativePath);
        return c.json(file);
      }
      const result = workspace.listProjectFiles(c.req.param("id"));
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to access files";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.post("/:id/commands", async (c) => {
    if (!devCommandsEnabled()) {
      return c.json({ error: "command execution is disabled in production" }, 403);
    }

    const body = (await c.req.json()) as { cmd?: string };
    if (!body.cmd?.trim()) {
      return c.json({ error: "cmd is required" }, 400);
    }

    try {
      const result = await workspace.runProjectCommand(c.req.param("id"), body.cmd.trim());
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to run command";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      if (message.includes("rejected by gate")) {
        return c.json({ error: message }, 403);
      }
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
