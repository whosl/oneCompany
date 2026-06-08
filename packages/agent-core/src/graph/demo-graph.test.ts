import { eq } from "drizzle-orm";
import { events } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { runAgent } from "../executor.js";
import { DUMMY_AGENT } from "../fixtures.js";
import { registerAgent } from "../registry.js";
import { seedProject, setupTestDb } from "../test-utils.js";
import { runDemoGraph } from "./demo-graph.js";
import type { OrchestrationContext } from "./types.js";

function createOrchestrationContext(db: ReturnType<typeof setupTestDb>["db"]): OrchestrationContext {
  return {
    db,
    runAgent: (input) => runAgent({ db }, input),
  };
}

describe("demo graph — M2", () => {
  it("runs two nodes and finishes with artifact.created", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      registerAgent(db, DUMMY_AGENT);

      const finalState = await runDemoGraph(createOrchestrationContext(db), {
        projectId,
        agentIdAtVersion: "dummy@1.0.0",
      });

      expect(finalState.done).toBe(true);
      expect(finalState.attempts).toBe(1);

      const eventTypes = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => row.type);

      expect(eventTypes).toContain("agent.started");
      expect(eventTypes).toContain("agent.reflect");
      expect(eventTypes).toContain("artifact.created");
    } finally {
      cleanup();
    }
  });

  it("routes to gate placeholder when budget exhausted after failure", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      registerAgent(db, DUMMY_AGENT);

      const gateHooks = {
        createGate: () => ({ id: "gate-1" }),
        waitForGate: async () => "retry",
      };

      const finalState = await runDemoGraph(
        { ...createOrchestrationContext(db), gateHooks },
        {
          projectId,
          agentIdAtVersion: "dummy@1.0.0",
          maxAttempts: 1,
          forceFail: true,
        },
      );

      expect(finalState.needsGate).toBe(true);
      expect(finalState.attempts).toBe(1);
      expect(finalState.lastRunFailed).toBe(true);
    } finally {
      cleanup();
    }
  });
});
