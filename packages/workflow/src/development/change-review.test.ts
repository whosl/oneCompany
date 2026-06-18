import { describe, expect, it } from "vitest";
import { acceptanceCriteriaVersions, changeRequests, projects } from "@oc/shared";
import { eq } from "drizzle-orm";
import { handleChangeReviewDecision, startRequirementChangeReview } from "./change-review.js";
import { startDevelopment, resumeDevelopmentAfterGate } from "./engine.js";
import { loadDevSession, saveDevSession } from "./state.js";
import { setupDevelopmentTest, waitForSliceLoopIdle } from "../test-utils.js";

async function reachChangeReview(
  db: ReturnType<typeof setupDevelopmentTest>["db"],
  projectId: string,
  deps: ReturnType<typeof setupDevelopmentTest>["deps"],
) {
  await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
  await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
  // Tech-plan approval starts the slice loop in the background (fire-and-forget);
  // wait for it to reach the slice-failure gate before issuing the skip request.
  await waitForSliceLoopIdle(db, projectId);
  await resumeDevelopmentAfterGate(deps, { projectId, decision: "request_skip_slice" });
}

describe("change review", () => {
  it("update_plan appends acceptance version and continues developing", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachChangeReview(db, projectId, deps);
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
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachChangeReview(db, projectId, deps);
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "revise_tech_plan",
      });
      expect(result.projectStatus).toBe("Tech Plan Review");
    } finally {
      cleanup();
    }
  });

  it("reject from skip_slice reopens the slice_failure gate", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest({ alwaysFail: true });
    try {
      await reachChangeReview(db, projectId, deps);
      const result = await resumeDevelopmentAfterGate(deps, {
        projectId,
        decision: "reject",
      });
      expect(result.projectStatus).toBe("Developing");
      expect(result.phase).toBe("awaiting_gate");
      expect(result.gateType).toBe("slice_failure");
      expect(result.gateId).toBeTruthy();
      expect(result.state.risks.some((risk) => risk.includes("rejected"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("reject from requirement_change resets the active slice to pending", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
      // Wait for the background slice loop to settle before opening the change review;
      // startRequirementChangeReview rejects while a slice loop is still active.
      await waitForSliceLoopIdle(db, projectId);

      const developing = loadDevSession(db, projectId);
      const activeSlice = developing.state.taskQueue[0];
      saveDevSession(db, projectId, {
        ...developing,
        state: {
          ...developing.state,
          taskQueue: developing.state.taskQueue.map((task) =>
            task.id === activeSlice?.id
              ? { ...task, status: "in_progress" as const }
              : task,
          ),
          currentTask: activeSlice ? { ...activeSlice, status: "in_progress" } : undefined,
        },
        meta: { ...developing.meta, phase: "slicing" },
      });
      db.update(projects)
        .set({ status: "Developing" })
        .where(eq(projects.id, projectId))
        .run();

      startRequirementChangeReview(deps, {
        projectId,
        summary: "Add export to CSV",
      });

      const reviewPayload = loadDevSession(db, projectId);
      const rejected = handleChangeReviewDecision(deps, reviewPayload, "reject");
      expect(rejected.meta.phase).toBe("slicing");
      expect(rejected.meta.gateId).toBeUndefined();
      expect(rejected.state.taskQueue[0]?.status).toBe("pending");
      expect(db.select().from(changeRequests).all()[0]?.status).toBe("resolved");
    } finally {
      cleanup();
    }
  });

  it("update_plan from requirement_change creates a repair task with user feedback", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
      await waitForSliceLoopIdle(db, projectId);
      db.update(projects)
        .set({ status: "Developing" })
        .where(eq(projects.id, projectId))
        .run();

      const feedback = "注册时报错 Unexpected non-whitespace character after JSON";
      startRequirementChangeReview(deps, {
        projectId,
        summary: feedback,
      });

      const reviewPayload = loadDevSession(db, projectId);
      const updated = handleChangeReviewDecision(deps, reviewPayload, "update_plan");
      const repair = updated.state.taskQueue.at(-1);

      expect(repair?.id).toBe("change-repair-1");
      expect(repair?.status).toBe("pending");
      expect(repair?.description).toContain(feedback);
      expect(updated.meta.currentSliceId).toBe("change-repair-1");
      expect(db.select().from(changeRequests).all()[0]?.status).toBe("resolved");
    } finally {
      cleanup();
    }
  });
});
