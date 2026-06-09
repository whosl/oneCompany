import { Hono } from "hono";
import type { DevFixtureProfile } from "@oc/agent-core";
import { isFixtureProfileAllowed } from "../config/engine-mode.js";
import type { DevelopmentService } from "./service.js";

export function createDevelopmentRoutes(development: DevelopmentService) {
  const app = new Hono();

  app.post("/:id/development/start", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { profile?: DevFixtureProfile };
    if (body.profile && !isFixtureProfileAllowed()) {
      return c.json({ error: "fixture profile is only allowed in stub engine mode" }, 400);
    }
    const result = await development.start(projectId, body.profile);
    return c.json(result);
  });

  app.get("/:id/development/status", (c) => {
    const projectId = c.req.param("id");
    const result = development.getStatus(projectId);
    return c.json(result);
  });

  return app;
}
