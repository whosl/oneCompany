import { Hono } from "hono";
import type { EnvironmentService } from "./service.js";

export function createEnvironmentRoutes(environment: EnvironmentService) {
  const router = new Hono();
  router.get("/readiness", (c) => c.json(environment.getReadiness()));
  return router;
}
