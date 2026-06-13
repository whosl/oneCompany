import { describe, expect, it } from "vitest";
import { changeRequests } from "@oc/shared";
import { eq } from "drizzle-orm";
import { projects } from "@oc/shared";
import {
  createRequirementChangeRequest,
  startRequirementChangeReview,
} from "./change-review.js";
import { analyzeChangeImpact } from "./change-request-impact.js";
import { resumeDevelopmentAfterGate, startDevelopment } from "./engine.js";
import { setupDevelopmentTest, waitForSliceLoopIdle } from "../test-utils.js";

describe("change request impact", () => {
  it("classifies architecture-impacting requirement changes", async () => {
    const { db, projectId, cleanup } = setupDevelopmentTest();
    try {
      const impact = analyzeChangeImpact(
        db,
        projectId,
        "Replace SQLite with Postgres and redesign auth schema",
      );
      expect(impact.impact).toBe("architecture");
      expect(impact.rollbackHints.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("opens Change Review for requirement changes during Developing", async () => {
    const { db, deps, projectId, cleanup } = setupDevelopmentTest();
    try {
      await startDevelopment(deps, { projectId, repoPath: deps.repoPath });
      await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
      // Wait for the background slice loop to settle; startRequirementChangeReview
      // rejects while a slice loop is still active.
      await waitForSliceLoopIdle(db, projectId);
      db.update(projects)
        .set({ status: "Developing" })
        .where(eq(projects.id, projectId))
        .run();

      const payload = startRequirementChangeReview(deps, {
        projectId,
        summary: "Switch database to Postgres",
        details: "Need new auth tables",
      });
      expect(payload.meta.phase).toBe("change_review");
      expect(payload.meta.pendingChangeRequestKind).toBe("requirement_change");
    } finally {
      cleanup();
    }
  });

  it("creates requirement_change rows with kind metadata", () => {
    const { db, projectId, cleanup } = setupDevelopmentTest();
    try {
      const { changeRequestId } = createRequirementChangeRequest(
        db,
        projectId,
        "Add dark mode toggle",
      );
      expect(changeRequestId).toBeTruthy();
      const row = db.select().from(changeRequests).all()[0];
      expect(row?.kind).toBe("requirement_change");
    } finally {
      cleanup();
    }
  });

  it("persists rollback hints in impact_summary", () => {
    const { db, projectId, cleanup } = setupDevelopmentTest();
    try {
      createRequirementChangeRequest(
        db,
        projectId,
        "Replace SQLite with Postgres and redesign auth schema",
      );
      const row = db.select().from(changeRequests).all()[0];
      expect(row?.impact_summary).toContain("Rollback hints:");
      expect(row?.impact_summary).toMatch(/rollback may be limited|Consider reverting commit/);
    } finally {
      cleanup();
    }
  });
});
