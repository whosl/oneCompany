import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { humanGates, techPlanVersions } from "@oc/shared";
import { startDevelopment, resumeDevelopmentAfterGate } from "./engine.js";
import { setupDevelopmentTest } from "../test-utils.js";

describe("tech plan + gate", () => {
  it("creates tech plan version and tech_plan_confirm gate on start", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      const result = await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      expect(result.projectStatus).toBe("Tech Plan Review");
      expect(result.phase).toBe("awaiting_gate");
      expect(result.gateType).toBe("tech_plan_confirm");

      const plans = db.select().from(techPlanVersions).all();
      expect(plans).toHaveLength(1);

      const gates = db
        .select()
        .from(humanGates)
        .where(eq(humanGates.project_id, projectId))
        .all();
      expect(gates.some((g) => g.gate_type === "tech_plan_confirm")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("approve moves to Developing with task queue", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      const started = await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      const resumed = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      expect(["Developing", "Testing"]).toContain(resumed.projectStatus);
      expect(resumed.state.taskQueue.length).toBeGreaterThan(0);
      expect(resumed.state.taskQueue[0]?.testCommand).toBeTruthy();
      expect(db.select().from(techPlanVersions).all()).toHaveLength(1);
      void started;
    } finally {
      cleanup();
    }
  });
});
