import { describe, expect, it } from "vitest";
import { changeRequests } from "@oc/shared";
import { startDevelopment, resumeDevelopmentAfterGate } from "./engine.js";
import { setupDevelopmentTest } from "../test-utils.js";

async function reachSliceFailureGate(projectId: string, deps: ReturnType<typeof setupDevelopmentTest>["deps"]) {
  await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
  return resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
}

describe("slice failure gate", () => {
  it("raises gate after budget exhausted", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      const result = await reachSliceFailureGate(projectId, deps);
      expect(result.gateType).toBe("slice_failure");
      expect(result.state.currentSliceAttempts).toBe(4);
    } finally {
      cleanup();
    }
  });

  it("retry continues current slice", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachSliceFailureGate(projectId, deps);
      const retried = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "retry",
      });
      expect(retried.projectStatus).toBe("Developing");
      expect(retried.phase).toBe("slicing");
    } finally {
      cleanup();
    }
  });

  it("replan returns to Tech Plan Review", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachSliceFailureGate(projectId, deps);
      const replanned = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "replan",
      });
      expect(replanned.projectStatus).toBe("Tech Plan Review");
      expect(replanned.gateType).toBe("tech_plan_confirm");
    } finally {
      cleanup();
    }
  });

  it("request_skip_slice opens change review without marking passed", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachSliceFailureGate(projectId, deps);
      const skipped = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "request_skip_slice",
      });
      expect(skipped.projectStatus).toBe("Change Review");
      expect(skipped.state.taskQueue[0]?.status).not.toBe("passed");
      expect(db.select().from(changeRequests).all()).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("fail sets project Failed", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachSliceFailureGate(projectId, deps);
      const failed = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "fail",
      });
      expect(failed.projectStatus).toBe("Failed");
      expect(failed.phase).toBe("failed");
    } finally {
      cleanup();
    }
  });
});
