import { describe, expect, it } from "vitest";
import { acceptanceCriteriaVersions, changeRequests } from "@oc/shared";
import { startDevelopment, resumeDevelopmentAfterGate } from "./engine.js";
import { setupDevelopmentTest } from "../test-utils.js";

async function reachChangeReview(projectId: string, deps: ReturnType<typeof setupDevelopmentTest>["deps"]) {
  await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
  await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
  await resumeDevelopmentAfterGate(deps, { projectId, decision: "request_skip_slice" });
}

describe("change review", () => {
  it("update_plan appends acceptance version and continues developing", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachChangeReview(projectId, deps);
      const before = db.select().from(acceptanceCriteriaVersions).all().length;
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "update_plan",
      });
      expect(db.select().from(acceptanceCriteriaVersions).all().length).toBe(before + 1);
      expect(result.state.taskQueue[0]?.status).toBe("skipped");
      expect(db.select().from(changeRequests).all()[0]?.status).toBe("resolved");
    } finally {
      cleanup();
    }
  });

  it("revise_tech_plan routes to Tech Plan Review", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachChangeReview(projectId, deps);
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "revise_tech_plan",
      });
      expect(result.projectStatus).toBe("Tech Plan Review");
    } finally {
      cleanup();
    }
  });

  it("reject returns to Developing and clears pending change request", async () => {
    const { deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachChangeReview(projectId, deps);
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "reject",
      });
      expect(result.phase).toBe("slicing");
      expect(result.projectStatus).toBe("Developing");
      expect(result.gateId).toBeUndefined();
      expect(result.state.risks.some((risk) => risk.includes("rejected"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
