import { Hono } from "hono";
import type { PanelService } from "./service.js";

export function createPanelRoutes(panel: PanelService) {
  const router = new Hono();

  router.get("/:id/diffs", (c) => {
    try {
      return c.json(panel.listDiffs(c.req.param("id")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to list diffs";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/diffs/:diffId", (c) => {
    try {
      return c.json(panel.getDiffPatch(c.req.param("id"), c.req.param("diffId")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load diff";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/tests/results", (c) => {
    try {
      return c.json(panel.getTestsResults(c.req.param("id")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load tests";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/preview/status", async (c) => {
    try {
      return c.json(await panel.getPreviewStatus(c.req.param("id")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load preview status";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  router.get("/:id/report", (c) => {
    try {
      return c.json(panel.getReport(c.req.param("id")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load report";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
