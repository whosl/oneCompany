import { createDb, type Db } from "@oc/shared";
import { Hono } from "hono";
import { broadcastEvent } from "./events/broadcast.js";
import { createEventRoutes } from "./events/routes.js";
import { createGateResumeHandler } from "./gates/resume.js";
import { createGateRoutes, createProjectGateRoutes } from "./gates/routes.js";
import { createGateService } from "./gates/service.js";
import type { RequirementService } from "./requirement/service.js";
import { createOrchestrationRoutes } from "./orchestration/routes.js";
import { createProjectRoutes } from "./projects/routes.js";
import { createProjectService } from "./projects/service.js";
import { createRequirementRoutes } from "./requirement/routes.js";
import { createRequirementService } from "./requirement/service.js";
import { createWorkspaceRoutes } from "./workspace/routes.js";
import { createWorkspaceService } from "./workspace/service.js";

export type AppDependencies = {
  db: Db;
  generatedProjectsRoot?: string;
};

export function createApp(deps: AppDependencies) {
  const app = new Hono();
  const onEvent = broadcastEvent;
  const projects = createProjectService(deps.db, onEvent);
  const resumeRef: { requirement?: RequirementService } = {};
  const gates = createGateService(deps.db, onEvent, {
    onGateResolved: async (gate, decision) => {
      await createGateResumeHandler(resumeRef.requirement)(gate, decision);
    },
  });
  const requirement = createRequirementService(deps.db, projects, gates, onEvent);
  resumeRef.requirement = requirement;
  const workspace = createWorkspaceService(deps.db, projects, gates, {
    onEvent,
    generatedProjectsRoot: deps.generatedProjectsRoot,
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/projects", createProjectRoutes(projects, workspace));
  app.route("/projects", createWorkspaceRoutes(workspace));
  app.route("/projects", createEventRoutes(deps.db));
  app.route("/gates", createGateRoutes(gates));
  app.route("/projects", createProjectGateRoutes(gates));
  app.route("/projects", createOrchestrationRoutes(deps.db, onEvent));
  app.route("/projects", createRequirementRoutes(requirement));

  return {
    app,
    projects,
    gates,
    requirement,
    workspace,
  };
}

export function createDefaultApp(dbPath?: string) {
  const db = createDb(dbPath);
  return createApp({ db });
}
