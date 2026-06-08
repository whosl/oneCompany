import { Hono } from "hono";
import type { ConsoleService } from "./service.js";

export function createConsoleRoutes(consoleService: ConsoleService) {
  const router = new Hono();

  router.get("/:id/console/snapshot", (c) => {
    try {
      return c.json(consoleService.getSnapshot(c.req.param("id")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to load snapshot";
      if (message.includes("not found")) {
        return c.json({ error: message }, 404);
      }
      return c.json({ error: message }, 400);
    }
  });

  return router;
}
