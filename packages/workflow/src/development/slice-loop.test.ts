import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { commits, diffs, events } from "@oc/shared";
import { startDevelopment, resumeDevelopmentAfterGate } from "./engine.js";
import { setupDevelopmentTest } from "../test-utils.js";

describe("slice loop with stub harness", () => {
  it("retries on authoritative failure then commits on pass", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({
      authoritativeAttemptsBeforePass: 2,
    });
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });

      expect(result.state.commits).toHaveLength(1);
      expect(result.state.currentSliceAttempts).toBe(0);
      expect(db.select().from(commits).all()).toHaveLength(1);
      expect(db.select().from(diffs).all()).toHaveLength(1);

      const testEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => JSON.parse(row.payload) as { type: string; status?: string });
      const failed = testEvents.filter((e) => e.type === "test.result" && e.status === "failed");
      const passed = testEvents.filter((e) => e.type === "test.result" && e.status === "passed");
      expect(failed.length).toBeGreaterThan(0);
      expect(passed.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("does not commit when authoritative check fails even if stub harness passes", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      expect(result.gateType).toBe("slice_failure");
      expect(db.select().from(commits).all()).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});
