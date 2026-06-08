import { createDb, type Db } from "@oc/shared";
import { Hono } from "hono";
import { broadcastEvent } from "./events/broadcast.js";
import { createEventRoutes } from "./events/routes.js";
import { createGateRoutes } from "./gates/routes.js";
import { createGateService } from "./gates/service.js";
import { createOrchestrationRoutes } from "./orchestration/routes.js";
import { createProjectRoutes } from "./projects/routes.js";
import { createProjectService } from "./projects/service.js";

export type AppDependencies = {
  db: Db;
};

export function createApp(deps: AppDependencies) {
  const app = new Hono();
  const onEvent = broadcastEvent;
  const projects = createProjectService(deps.db, onEvent);
  const gates = createGateService(deps.db, onEvent);

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/projects", createProjectRoutes(projects));
  app.route("/projects", createEventRoutes(deps.db));
  app.route("/gates", createGateRoutes(gates));
  app.route("/projects", createOrchestrationRoutes(deps.db, onEvent));

  return {
    app,
    projects,
    gates,
  };
}

export function createDefaultApp(dbPath?: string) {
  const db = createDb(dbPath);
  return createApp({ db });
}
