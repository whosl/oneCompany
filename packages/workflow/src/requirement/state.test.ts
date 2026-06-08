import { eq } from "drizzle-orm";
import { requirementScores, requirementSessions } from "@oc/shared";
import { describe, expect, it } from "vitest";
import {
  appendRequirementScore,
  createRequirementSession,
  loadRequirementSession,
  saveRequirementSession,
} from "./state.js";
import { setupWorkflowTest } from "../test-utils.js";

describe("requirement state persistence — M3", () => {
  it("creates and reloads a requirement session", () => {
    const { db, projectId, cleanup } = setupWorkflowTest();
    try {
      const created = createRequirementSession(db, projectId, "Build a todo app", "vague");
      expect(created.state.rawRequirement).toBe("Build a todo app");
      expect(created.state.completenessThreshold).toBe(85);
      expect(created.state.maxQuestionRounds).toBe(6);

      const loaded = loadRequirementSession(db, projectId);
      expect(loaded.state.projectId).toBe(projectId);
      expect(loaded.meta.profile).toBe("vague");
    } finally {
      cleanup();
    }
  });

  it("persists updates including per-round scores", () => {
    const { db, projectId, cleanup } = setupWorkflowTest();
    try {
      const created = createRequirementSession(db, projectId, "Build a todo app", "vague");
      created.state.completenessScore = 72;
      saveRequirementSession(db, projectId, created);
      appendRequirementScore(db, projectId, 0, 72);

      const loaded = loadRequirementSession(db, projectId);
      expect(loaded.state.completenessScore).toBe(72);

      const [sessionRow] = db.select().from(requirementSessions).all();
      expect(sessionRow?.project_id).toBe(projectId);

      const [scoreRow] = db.select().from(requirementScores).all();
      expect(scoreRow?.score).toBe(72);
      expect(scoreRow?.round_index).toBe(0);
    } finally {
      cleanup();
    }
  });
});
