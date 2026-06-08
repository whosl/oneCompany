import { Hono } from "hono";
import type { TestingService } from "./service.js";

export function createTestingRoutes(testing: TestingService) {
  const app = new Hono();

  app.post("/:id/testing/start", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { requestDeploy?: boolean };
    const result = await testing.start(projectId, { requestDeploy: body.requestDeploy });
    return c.json(result);
  });

  app.get("/:id/testing/status", (c) => {
    const projectId = c.req.param("id");
    const result = testing.getStatus(projectId);
    return c.json(result);
  });

  app.post("/:id/preview/start", async (c) => {
    const projectId = c.req.param("id");
    const result = await testing.startPreview(projectId);
    return c.json(result);
  });

  app.post("/:id/preview/stop", async (c) => {
    const projectId = c.req.param("id");
    await testing.stopPreview(projectId);
    return c.json({ ok: true });
  });

  return app;
}
