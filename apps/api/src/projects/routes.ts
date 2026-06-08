import { Hono } from "hono";
import type { ProjectService } from "./service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function createProjectRoutes(projects: ProjectService, workspace?: WorkspaceService) {
  const router = new Hono();

  router.get("/", (c) => {
    return c.json({ projects: projects.listProjects() });
  });

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

  router.post("/:id/pause", (c) => {
    try {
      return c.json(projects.pauseProject(c.req.param("id")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to pause project";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.post("/:id/resume", (c) => {
    try {
      return c.json(projects.resumeProject(c.req.param("id")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to resume project";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
