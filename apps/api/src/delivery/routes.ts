import { Hono } from "hono";
import { DeliveryReportStatusError } from "@oc/workflow";
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
      if (error instanceof DeliveryReportStatusError) {
        return c.json({ error: message }, 409);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.post("/:id/delivery/export", (c) => {
    const projectId = c.req.param("id");
    try {
      const result = delivery.exportSubmission(projectId);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to export submission package";
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
