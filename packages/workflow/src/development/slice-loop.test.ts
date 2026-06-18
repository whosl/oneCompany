import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { commits, diffs, events } from "@oc/shared";
import { loadTestResults } from "../testing/results.js";
import { startDevelopment, resumeDevelopmentAfterGate } from "./engine.js";
import { getDevelopmentStatus } from "./engine.js";
import { setupDevelopmentTest, waitForSliceLoopIdle } from "../test-utils.js";

describe("slice loop with stub harness", () => {
  it("retries on authoritative failure then commits on pass", async () => {
    let typecheckCalls = 0;
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({
      authoritativeAttemptsBeforePass: 2,
      onSliceTypecheck: () => {
        typecheckCalls += 1;
      },
    });
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      // Slice loop runs in the background after tech-plan approval; wait for it
      // to reach a quiescent state before asserting on the final results.
      await waitForSliceLoopIdle(db, projectId);
      const result = getDevelopmentStatus(deps, projectId);

      expect(result.state.commits).toHaveLength(2);
      expect(result.state.currentSliceAttempts).toBe(0);
      expect(typecheckCalls).toBe(2);
      expect(db.select().from(commits).all()).toHaveLength(2);
      expect(db.select().from(diffs).all()).toHaveLength(2);

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

      const sliceResults = loadTestResults(db, projectId, "slice");
      expect(sliceResults.length).toBeGreaterThan(0);
      expect(sliceResults.every((row) => row.suite.startsWith("slice:"))).toBe(true);
      expect(result.state.taskQueue.map((task) => [task.id, task.status])).toEqual([
        ["slice-1", "passed"],
        ["reconciliation-1", "passed"],
      ]);
      expect(result.state.commits.at(-1)?.taskId).toBe("reconciliation-1");
      expect(result.phase).toBe("completed");
      expect(result.projectStatus).toBe("Testing");
    } finally {
      cleanup();
    }
  });

  it("retries without committing when slice typecheck fails after authoritative pass", async () => {
    let typecheckCalls = 0;
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({
      typecheckFailuresBeforePass: 1,
      typecheckFailureDetails: "fixture: TS2322 integration mismatch",
      onSliceTypecheck: () => {
        typecheckCalls += 1;
      },
    });
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      await waitForSliceLoopIdle(db, projectId);
      const result = getDevelopmentStatus(deps, projectId);

      expect(typecheckCalls).toBe(3);
      expect(result.state.commits).toHaveLength(2);
      expect(result.state.commits[0]?.taskId).toBe("slice-1");
      expect(
        result.state.testResults.some(
          (row) => row.status === "failed" && row.details?.includes("TS2322"),
        ),
      ).toBe(true);
      expect(result.state.currentSliceAttempts).toBe(0);
      expect(result.projectStatus).toBe("Testing");
    } finally {
      cleanup();
    }
  });

  it("injects reconciliation before transitioning to Testing", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      await waitForSliceLoopIdle(db, projectId);
      const result = getDevelopmentStatus(deps, projectId);

      const reconciliation = result.state.taskQueue.find((task) => task.id === "reconciliation-1");
      expect(reconciliation).toMatchObject({
        status: "passed",
        testCommand: "pnpm typecheck && pnpm test",
      });
      expect(reconciliation?.acceptanceChecks).toContain("Full-repo typecheck passes");
      expect(result.state.commits.at(-1)?.taskId).toBe("reconciliation-1");
      expect(result.projectStatus).toBe("Testing");
      expect(result.phase).toBe("completed");
    } finally {
      cleanup();
    }
  });

  it("does not commit when authoritative check fails even if stub harness passes", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      await waitForSliceLoopIdle(db, projectId);
      const result = getDevelopmentStatus(deps, projectId);
      expect(result.gateType).toBe("slice_failure");
      expect(db.select().from(commits).all()).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});
