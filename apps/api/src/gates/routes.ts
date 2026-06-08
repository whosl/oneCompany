import { Hono } from "hono";
import type { GateService } from "./service.js";

export function createGateRoutes(gates: GateService) {
  const router = new Hono();

  router.post("/:id/resolve", async (c) => {
    const body = (await c.req.json()) as { decision?: string };
    if (!body.decision?.trim()) {
      return c.json({ error: "decision is required" }, 400);
    }

    try {
      const gate = gates.resolveGate(c.req.param("id"), body.decision.trim());
      return c.json(gate);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to resolve gate";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
