import { describe, expect, it } from "vitest";
import { changeRequests } from "@oc/shared";
import { startDevelopment, resumeDevelopmentAfterGate, getDevelopmentStatus } from "./engine.js";
import { setupDevelopmentTest, waitForSliceLoopIdle } from "../test-utils.js";

async function reachSliceFailureGate(
  db: ReturnType<typeof setupDevelopmentTest>["db"],
  projectId: string,
  deps: ReturnType<typeof setupDevelopmentTest>["deps"],
) {
  await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
  await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
  // Slice loop runs in the background after tech-plan approval; wait for it to
  // exhaust its retry budget and raise the slice-failure gate.
  await waitForSliceLoopIdle(db, projectId);
  return getDevelopmentStatus(deps, projectId);
}

describe("slice failure gate", () => {
  it("raises gate after repeated same-category failures", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      const result = await reachSliceFailureGate(db, projectId, deps);
      expect(result.gateType).toBe("slice_failure");
      expect(result.state.currentSliceAttempts).toBe(2);
      expect(result.state.risks.some((risk) => risk.includes("Diagnosis gate"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("retry resets the failed slice to pending and reruns it", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      const gated = await reachSliceFailureGate(db, projectId, deps);
      expect(gated.state.taskQueue[0]?.status).toBe("failed");

      await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "retry",
      });
      // Retry relaunches the background slice loop with an extended budget;
      // alwaysFail drives it back to the slice-failure gate.
      await waitForSliceLoopIdle(db, projectId);
      const retried = getDevelopmentStatus(deps, projectId);
      expect(retried.projectStatus).toBe("Developing");
      expect(retried.gateType).toBe("slice_failure");
      expect(retried.state.taskQueue[0]?.status).toBe("failed");
      expect(retried.state.currentSliceAttempts).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("replan returns to Tech Plan Review", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachSliceFailureGate(db, projectId, deps);
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
      await reachSliceFailureGate(db, projectId, deps);
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
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachSliceFailureGate(db, projectId, deps);
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
