import { createDb, type Db } from "@oc/shared";
import { Hono } from "hono";
import { broadcastEvent } from "./events/broadcast.js";
import { createEventRoutes } from "./events/routes.js";
import { createGateResumeHandler } from "./gates/resume.js";
import { createGateRoutes, createProjectGateRoutes } from "./gates/routes.js";
import { createGateService } from "./gates/service.js";
import { createDevelopmentRoutes } from "./development/routes.js";
import { createDevelopmentService } from "./development/service.js";
import type { DevelopmentService } from "./development/service.js";
import { createTestingRoutes } from "./testing/routes.js";
import { createTestingService } from "./testing/service.js";
import type { TestingService } from "./testing/service.js";
import type { RequirementService } from "./requirement/service.js";
import { createOrchestrationRoutes } from "./orchestration/routes.js";
import { createInterruptRoutes } from "./projects/interrupt-routes.js";
import { createProjectRoutes } from "./projects/routes.js";
import { createProjectService } from "./projects/service.js";
import { createRequirementRoutes } from "./requirement/routes.js";
import { createRequirementService } from "./requirement/service.js";
import { createConsoleRoutes } from "./console/routes.js";
import { createConsoleService } from "./console/service.js";
import { createEnvironmentRoutes } from "./environment/routes.js";
import { createEnvironmentService } from "./environment/service.js";
import { createPanelRoutes } from "./panel/routes.js";
import { createPanelService } from "./panel/service.js";
import { createWorkspaceRoutes } from "./workspace/routes.js";
import { createWorkspaceService } from "./workspace/service.js";
import { createDeploymentRoutes } from "./deployment/routes.js";
import { createDeploymentService } from "./deployment/service.js";
import { createDeliveryRoutes } from "./delivery/routes.js";
import { createDeliveryService } from "./delivery/service.js";
import { createChangeRequestRoutes } from "./change-requests/routes.js";
import { createChangeRequestService } from "./change-requests/service.js";
import {
  createIntegrationRoutes,
  createProjectIntegrationRoutes,
} from "./integrations/routes.js";
import { createIntegrationService } from "./integrations/service.js";
import { createTaiziRoutes } from "./taizi/routes.js";
import { createTaiziService } from "./taizi/service.js";
import { createPluginRoutes } from "./plugin/routes.js";

export type AppDependencies = {
  db: Db;
  generatedProjectsRoot?: string;
};

export function createApp(deps: AppDependencies) {
  const app = new Hono();
  const onEvent = broadcastEvent;
  const projects = createProjectService(deps.db, onEvent);
  const resumeRef: {
    requirement?: RequirementService;
    development?: DevelopmentService;
    deployment?: ReturnType<typeof createDeploymentService>;
    delivery?: ReturnType<typeof createDeliveryService>;
  } = {};
  const gates = createGateService(deps.db, onEvent, {
    onGateResolved: async (gate, decision) => {
      await createGateResumeHandler(resumeRef)(gate, decision);
    },
  });
  const workspace = createWorkspaceService(deps.db, projects, gates, {
    onEvent,
    generatedProjectsRoot: deps.generatedProjectsRoot,
  });
  const delivery = createDeliveryService(deps.db, projects, gates, workspace, onEvent);
  const deployment = createDeploymentService(
    deps.db,
    projects,
    gates,
    workspace,
    delivery,
    onEvent,
  );
  const devCtx = { db: deps.db, projects, gates, workspace, onEvent };
  const requirement = createRequirementService(deps.db, projects, gates, workspace, onEvent);
  const development = createDevelopmentService(deps.db, projects, gates, workspace, onEvent);
  const changeRequests = createChangeRequestService(deps.db, projects, devCtx);
  const testing = createTestingService(
    deps.db,
    projects,
    gates,
    workspace,
    deployment,
    delivery,
    onEvent,
  );
  const panel = createPanelService(deps.db, projects, workspace);
  const consoleService = createConsoleService(deps.db, projects, gates);
  const environment = createEnvironmentService();
  const integrations = createIntegrationService(deps.db, projects, gates, workspace, onEvent);
  const taizi = createTaiziService({
    db: deps.db,
    projects,
    gates,
    workspace,
    requirement,
    development,
    testing,
    delivery,
    changeRequests,
    consoleService,
    onEvent,
  });
  resumeRef.requirement = requirement;
  resumeRef.development = development;
  resumeRef.deployment = deployment;
  resumeRef.delivery = delivery;

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/plugin", createPluginRoutes());
  app.route("/", createIntegrationRoutes(integrations));
  app.route("/environment", createEnvironmentRoutes(environment));
  app.route("/projects", createProjectRoutes(projects, workspace));
  app.route("/projects", createWorkspaceRoutes(workspace));
  app.route("/projects", createEventRoutes(deps.db));
  app.route("/gates", createGateRoutes(gates));
  app.route("/projects", createProjectGateRoutes(gates));
  app.route("/projects", createOrchestrationRoutes(deps.db, onEvent));
  app.route("/projects", createRequirementRoutes(requirement));
  app.route("/projects", createDevelopmentRoutes(development));
  app.route("/projects", createTestingRoutes(testing));
  app.route("/projects", createDeploymentRoutes(deployment));
  app.route("/projects", createDeliveryRoutes(delivery));
  app.route("/projects", createChangeRequestRoutes(changeRequests));
  app.route("/projects", createInterruptRoutes(deps.db, onEvent));
  app.route("/projects", createTaiziRoutes(taizi));
  app.route("/projects", createPanelRoutes(panel));
  app.route("/projects", createConsoleRoutes(consoleService));
  app.route("/projects", createProjectIntegrationRoutes(integrations));

  return {
    app,
    projects,
    gates,
    requirement,
    development,
    testing,
    workspace,
    panel,
  };
}

export function createDefaultApp(dbPath?: string) {
  const db = createDb(dbPath);
  return createApp({ db });
}
