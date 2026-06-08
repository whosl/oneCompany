import { Hono } from "hono";
import type { ProjectService } from "./service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function createProjectRoutes(projects: ProjectService, workspace?: WorkspaceService) {
  const router = new Hono();

  router.post("/", async (c) => {
    const body = (await c.req.json()) as { name?: string };
    if (!body.name?.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    const project = projects.createProject(body.name.trim());
    workspace?.ensureForProject(project);
    return c.json(project, 201);
  });

  router.get("/:id", (c) => {
    const project = projects.getProject(c.req.param("id"));
    if (!project) {
      return c.json({ error: "project not found" }, 404);
    }
    return c.json(project);
  });

  return router;
}
