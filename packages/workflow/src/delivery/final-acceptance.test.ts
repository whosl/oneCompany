import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { projects } from "@oc/shared";
import { initRepo } from "@oc/workspace";
import { enterAwaitingAcceptance, handleFinalAcceptanceDecision } from "./final-acceptance.js";
import { createTestingDeps, seedTestingProject, setupTestDb } from "../test-utils.js";

describe("final acceptance", () => {
  it("accept moves to Delivered", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-final-repo-"));
    const artifactsPath = mkdtempSync(path.join(tmpdir(), "oc-final-artifacts-"));
    initRepo(repoPath);
    const { projectId } = seedTestingProject(db, repoPath);
    db.update(projects)
      .set({ status: "Awaiting Acceptance" })
      .where(eq(projects.id, projectId))
      .run();

    const deps = createTestingDeps(db, repoPath);
    try {
      const awaiting = enterAwaitingAcceptance(deps, {
        projectId,
        repoPath,
        artifactsPath,
      });
      expect(awaiting.phase).toBe("awaiting_final_acceptance");
      expect(awaiting.gateId).toBeTruthy();

      const accepted = handleFinalAcceptanceDecision(deps, {
        projectId,
        decision: "accept",
      });
      expect(accepted.projectStatus).toBe("Delivered");
    } finally {
      cleanup();
    }
  });

  it("reject_and_redo returns to Developing", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-reject-repo-"));
    const artifactsPath = mkdtempSync(path.join(tmpdir(), "oc-reject-artifacts-"));
    initRepo(repoPath);
    const { projectId } = seedTestingProject(db, repoPath);
    db.update(projects)
      .set({ status: "Awaiting Acceptance" })
      .where(eq(projects.id, projectId))
      .run();

    const deps = createTestingDeps(db, repoPath);
    try {
      enterAwaitingAcceptance(deps, { projectId, repoPath, artifactsPath });
      const rejected = handleFinalAcceptanceDecision(deps, {
        projectId,
        decision: "reject_and_redo",
      });
      expect(rejected.projectStatus).toBe("Developing");
    } finally {
      cleanup();
    }
  });
});
