import { describe, expect, it } from "vitest";
import { runTestingPhase, getTestingStatus } from "./engine.js";
import { setupTestingTest } from "../test-utils.js";

describe("testing phase engine", () => {
  it("runs full suite and moves to Awaiting Acceptance when all pass", async () => {
    const { deps, projectId, cleanup } = setupTestingTest();
    try {
      const result = await runTestingPhase(deps, { projectId });
      expect(result.projectStatus).toBe("Awaiting Acceptance");
      expect(result.phase).toBe("passed");
      expect(result.suiteResults).toHaveLength(4);
      expect(result.previewUrl).toBeTruthy();
      expect(result.state.previewUrl).toBe(result.previewUrl);
    } finally {
      cleanup();
    }
  });

  it("routes to Deploying when requestDeploy is true", async () => {
    const { deps, projectId, cleanup } = setupTestingTest();
    try {
      const result = await runTestingPhase(deps, { projectId, requestDeploy: true });
      expect(result.projectStatus).toBe("Deploying");
    } finally {
      cleanup();
    }
  });

  it("returns to Developing when a suite fails", async () => {
    const { deps, projectId, cleanup } = setupTestingTest({
      suiteResults: { "final:vitest": "failed" },
    });
    try {
      const result = await runTestingPhase(deps, { projectId });
      expect(result.projectStatus).toBe("Developing");
      expect(result.phase).toBe("failed");
      expect(result.qaNotes?.length).toBeGreaterThan(0);
      expect(result.suiteResults.some((r) => r.suite === "final:vitest" && r.status === "failed")).toBe(
        true,
      );
    } finally {
      cleanup();
    }
  });

  it("getTestingStatus returns current session summary", async () => {
    const { deps, projectId, cleanup } = setupTestingTest();
    try {
      await runTestingPhase(deps, { projectId });
      const status = getTestingStatus(deps, projectId);
      expect(status.suiteResults.length).toBe(4);
    } finally {
      cleanup();
    }
  });
});
