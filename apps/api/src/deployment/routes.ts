import { Hono } from "hono";
import type { DeploymentService } from "./service.js";

export function createDeploymentRoutes(deployment: DeploymentService) {
  const router = new Hono();

  router.post("/:id/deployment/start", (c) => {
    const projectId = c.req.param("id");
    try {
      const result = deployment.start(projectId);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to start deployment";
      return c.json({ error: message }, 400);
    }
  });

  router.post("/:id/deployment/url", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json()) as { url?: string };
    if (!body.url?.trim()) {
      return c.json({ error: "url is required" }, 400);
    }
    try {
      const result = deployment.submitUrl(projectId, body.url.trim());
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to submit deployment url";
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/deployment", (c) => {
    const projectId = c.req.param("id");
    try {
      return c.json(deployment.getStatus(projectId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to get deployment status";
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
