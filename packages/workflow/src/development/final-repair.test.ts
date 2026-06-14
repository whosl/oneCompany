import { describe, expect, it } from "vitest";
import { runTestingPhase } from "../testing/engine.js";
import {
  createDevelopmentDeps,
  setupTestingTest,
  waitForSliceLoopIdle,
} from "../test-utils.js";
import { startDevelopment } from "./engine.js";
import { startFinalRepair } from "./final-repair.js";
import { isSliceLoopActive } from "./slice-loop-registry.js";
import { loadDevSession, saveDevSession } from "./state.js";

describe("final testing repair loop", () => {
  it("recovers a completed development session and runs Coding, Review, then retest", async () => {
    const suiteResults = { "final:typecheck": "failed" as "failed" | "passed" };
    const { db, deps: testingDeps, projectId, repoPath, cleanup } = setupTestingTest({
      suiteResults,
    });
    try {
      await runTestingPhase(testingDeps, { projectId, requestDeploy: true });

      let reviewCount = 0;
      let retestRequest: { attempt: number; requestDeploy: boolean } | undefined;
      const deps = createDevelopmentDeps(db, repoPath, {
        onFinalRepairCompleted: async ({ attempt, requestDeploy }) => {
          retestRequest = { attempt, requestDeploy };
          suiteResults["final:typecheck"] = "passed";
          await runTestingPhase(testingDeps, { projectId, requestDeploy });
        },
      });
      const baseReview = deps.harness.runReview;
      deps.harness = {
        ...deps.harness,
        runReview: async (input, context) => {
          reviewCount += 1;
          return baseReview!(input, context);
        },
      };

      const started = await startDevelopment(deps, { projectId, repoPath });
      expect(started.running).toBe(true);

      await waitForSliceLoopIdle(db, projectId);
      const deadline = Date.now() + 2_000;
      while (deps.getProjectStatus(projectId) !== "Deploying" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const completed = loadDevSession(db, projectId);
      const repairTask = completed.state.taskQueue.find((task) => task.id === "final-repair-1");
      expect(repairTask?.status).toBe("passed");
      expect(repairTask?.description).toContain("final:typecheck");
      expect(completed.meta.phase).toBe("completed");
      expect(completed.meta.finalRepair).toBeUndefined();
      expect(completed.testing?.phase).toBe("passed");
      expect(completed.testing?.qaNotes).toContain("final acceptance suite passed");
      expect(deps.getProjectStatus(projectId)).toBe("Deploying");
      expect(reviewCount).toBe(1);
      expect(retestRequest).toEqual({ attempt: 1, requestDeploy: true });
    } finally {
      cleanup();
    }
  });

  it("raises a manual gate after three automatic repair attempts", async () => {
    const { db, deps: testingDeps, projectId, repoPath, cleanup } = setupTestingTest({
      suiteResults: { "final:build": "failed" },
    });
    try {
      await runTestingPhase(testingDeps, { projectId });
      const payload = loadDevSession(db, projectId);
      saveDevSession(db, projectId, {
        ...payload,
        meta: {
          ...payload.meta,
          finalRepair: {
            attempt: 3,
            failedSuites: ["final:build"],
            qaNotes: [],
            requestDeploy: false,
            pendingRetest: false,
          },
        },
      });

      const result = startFinalRepair(createDevelopmentDeps(db, repoPath), { projectId });
      expect(result.phase).toBe("awaiting_gate");
      expect(result.gateType).toBe("slice_failure");
      expect(isSliceLoopActive(projectId)).toBe(false);
      expect(loadDevSession(db, projectId).meta.currentSliceId).toBe("final-repair-4");
    } finally {
      cleanup();
    }
  });
});
