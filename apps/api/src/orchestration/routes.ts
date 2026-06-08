import { DUMMY_AGENT, registerAgent, runAgent, runDemoGraph } from "@oc/agent-core";
import { Hono } from "hono";
import type { Db, EventEnvelope } from "@oc/shared";

export function createOrchestrationRoutes(db: Db, onEvent: (envelope: EventEnvelope) => void) {
  const app = new Hono();

  app.post("/:id/demo-run", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      agentIdAtVersion?: string;
      forceFail?: boolean;
      maxAttempts?: number;
    };

    registerAgent(db, DUMMY_AGENT);

    const finalState = await runDemoGraph(
      {
        db,
        onEvent,
        runAgent: (input) => runAgent({ db, onEvent }, input),
        gateHooks: undefined,
      },
      {
        projectId,
        agentIdAtVersion: body.agentIdAtVersion ?? "dummy@1.0.0",
        forceFail: body.forceFail,
        maxAttempts: body.maxAttempts,
      },
    );

    return c.json({ ok: true, state: finalState });
  });

  return app;
}
