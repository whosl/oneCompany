import { Hono } from "hono";
import type { IntegrationService } from "./service.js";

export function createIntegrationRoutes(integrations: IntegrationService) {
  const app = new Hono();

  app.get("/integrations", (c) =>
    c.json({
      integrations: integrations.listDefinitions(),
      gateway: integrations.getGatewayMeta(),
    }),
  );
  app.get("/integrations/skill-packs", (c) => c.json({ skillPacks: integrations.listSkillPacks() }));

  return app;
}

export function createProjectIntegrationRoutes(integrations: IntegrationService) {
  const app = new Hono();

  app.get("/:projectId/integrations", (c) => {
    const projectId = c.req.param("projectId");
    return c.json({ integrations: integrations.listProjectStatus(projectId) });
  });

  app.post("/:projectId/integrations/:integrationId/enable", async (c) => {
    const projectId = c.req.param("projectId");
    const integrationId = c.req.param("integrationId");
    const body = (await c.req.json()) as { scopes?: string[] };
    const connection = await integrations.enableForProject(
      projectId,
      integrationId,
      body.scopes ?? [],
    );
    return c.json(connection);
  });

  app.post("/:projectId/integrations/opencode/call", async (c) => {
    const projectId = c.req.param("projectId");
    const body = (await c.req.json()) as { toolName: string; args?: unknown };
    const result = await integrations.callOpencodeTool(projectId, body.toolName, body.args);
    return c.json(result);
  });

  app.post("/:projectId/integrations/:integrationId/call", async (c) => {
    const projectId = c.req.param("projectId");
    const integrationId = c.req.param("integrationId");
    const body = (await c.req.json()) as { toolName: string; args?: unknown };
    const result = await integrations.callTool(
      projectId,
      integrationId,
      body.toolName,
      body.args,
    );
    return c.json(result);
  });

  return app;
}
