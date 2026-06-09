import { Hono } from "hono";
import type { ChangeRequestService } from "./service.js";

export function createChangeRequestRoutes(changeRequests: ChangeRequestService) {
  const router = new Hono();

  router.post("/:id/change-requests", async (c) => {
    const projectId = c.req.param("id");
    const body = await c.req.json();
    try {
      const result = changeRequests.create(projectId, body);
      return c.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to create change request";
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/change-requests", (c) => {
    const projectId = c.req.param("id");
    return c.json({ changeRequests: changeRequests.list(projectId) });
  });

  return router;
}
