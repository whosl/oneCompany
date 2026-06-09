import { Hono } from "hono";
import type { DeliveryService } from "./service.js";

export function createDeliveryRoutes(delivery: DeliveryService) {
  const router = new Hono();

  router.post("/:id/delivery/generate", (c) => {
    const projectId = c.req.param("id");
    try {
      const result = delivery.generateReport(projectId);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to generate delivery report";
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/delivery", (c) => {
    const projectId = c.req.param("id");
    try {
      return c.json(delivery.getStatus(projectId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to get delivery status";
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
