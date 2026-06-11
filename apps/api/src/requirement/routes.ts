import { Hono } from "hono";
import type { RequirementFixtureProfile } from "@oc/agent-core";
import { isFixtureProfileAllowed } from "../config/engine-mode.js";
import type { RequirementService } from "./service.js";

export function createRequirementRoutes(requirement: RequirementService) {
  const app = new Hono();

  app.post("/:id/requirement/start", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json()) as {
      requirement: string;
      profile?: RequirementFixtureProfile;
    };

    if (body.profile && !isFixtureProfileAllowed()) {
      return c.json({ error: "fixture profile is only allowed in stub engine mode" }, 400);
    }

    const result = await requirement.start(projectId, body.requirement, body.profile);
    return c.json(result);
  });

  app.post("/:id/requirement/answers", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json()) as { answers: string[] };
    const result = await requirement.submitAnswers(projectId, body.answers);
    return c.json(result);
  });

  app.post("/:id/requirement/skip", async (c) => {
    const projectId = c.req.param("id");
    const result = await requirement.skipClarification(projectId);
    return c.json(result);
  });

  return app;
}
