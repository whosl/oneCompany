import { describe, expect, it } from "vitest";
import { startDevelopment, resumeDevelopmentAfterGate } from "./engine.js";
import { setupDevelopmentTest } from "../test-utils.js";

describe("slice planner", () => {
  it("builds non-empty task queue with testCommand per slice", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      expect(result.state.taskQueue.length).toBeGreaterThanOrEqual(1);
      for (const slice of result.state.taskQueue) {
        expect(slice.testCommand.length).toBeGreaterThan(0);
      }
      expect(result.state.taskQueue[0]?.id).toBe("slice-1");
    } finally {
      cleanup();
    }
  });

  it("plans two slices for two_slices profile", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      await startDevelopment(deps, {
        projectId,
        repoPath: deps.repoPath,
        profile: "two_slices",
      });
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "approve",
      });
      expect(result.state.taskQueue).toHaveLength(2);
    } finally {
      cleanup();
    }
  });
});
