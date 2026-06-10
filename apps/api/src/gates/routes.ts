import { GateResumeConflictError, GateResumeFailedError } from "@oc/shared";
import { Hono } from "hono";
import type { GateService } from "./service.js";

export function createGateRoutes(gates: GateService) {
  const router = new Hono();

  router.post("/:id/resolve", async (c) => {
    const body = (await c.req.json()) as { decision?: string; customText?: string };
    if (!body.decision?.trim()) {
      return c.json({ error: "decision is required" }, 400);
    }

    try {
      const gate = await gates.resolveGate(c.req.param("id"), {
        decision: body.decision.trim(),
        customText: body.customText,
      });
      return c.json(gate);
    } catch (error) {
      if (error instanceof GateResumeConflictError) {
        return c.json({ error: error.message, reason: error.reason }, 409);
      }
      if (error instanceof GateResumeFailedError) {
        return c.json({ error: error.message, gateId: error.gateId }, 500);
      }
      const message = error instanceof Error ? error.message : "failed to resolve gate";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  return router;
}

export function createProjectGateRoutes(gates: GateService) {
  const router = new Hono();

  router.get("/:id/gates", (c) => {
    const projectId = c.req.param("id");
    const openGates = gates.listOpenGates(projectId);
    return c.json({ gates: openGates });
  });

  return router;
}
