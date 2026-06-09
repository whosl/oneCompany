import { eq } from "drizzle-orm";
import { agentRuns, events } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { DUMMY_AGENT } from "./fixtures.js";
import { runAgent } from "./executor.js";
import { registerAgent } from "./registry.js";
import { seedProject, setupTestDb } from "./test-utils.js";

describe("runAgent — M2", () => {
  it("emits P/A/O/R in order and writes agent_runs", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      registerAgent(db, DUMMY_AGENT);

      const result = await runAgent({ db }, { projectId, agentIdAtVersion: "dummy@1.0.0", task: {} });
      expect(result.failed).toBe(false);
      expect(result.modelId).toBe("gpt-4.1-mini");

      const eventTypes = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => row.type);

      expect(eventTypes).toEqual([
        "agent.started",
        "agent.plan",
        "agent.act",
        "agent.observe",
        "agent.reflect",
      ]);

      const [run] = db.select().from(agentRuns).all();
      expect(run?.status).toBe("completed");
      expect(run?.run_id).toBe(result.runId);
    } finally {
      cleanup();
    }
  });

  it("emits agent.error and run.failed without throwing", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      registerAgent(db, DUMMY_AGENT);

      const result = await runAgent(
        { db },
        { projectId, agentIdAtVersion: "dummy@1.0.0", task: {}, forceFail: true },
      );

      expect(result.failed).toBe(true);

      const eventTypes = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => row.type);

      expect(eventTypes).toEqual(["agent.started", "agent.error", "run.failed"]);

      const [run] = db.select().from(agentRuns).all();
      expect(run?.status).toBe("failed");
    } finally {
      cleanup();
    }
  });

  it("emits agent.error and run.failed when runner throws", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      registerAgent(db, DUMMY_AGENT);

      const result = await runAgent(
        {
          db,
          runner: async () => {
            throw new Error("LLM structured output failed");
          },
        },
        { projectId, agentIdAtVersion: "dummy@1.0.0", task: {} },
      );

      expect(result.failed).toBe(true);

      const eventTypes = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => row.type);

      expect(eventTypes).toEqual(["agent.started", "agent.error", "run.failed"]);

      const [run] = db.select().from(agentRuns).all();
      expect(run?.status).toBe("failed");
    } finally {
      cleanup();
    }
  });
});
