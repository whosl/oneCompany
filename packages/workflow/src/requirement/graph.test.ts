import { eq } from "drizzle-orm";
import { prdVersions, acceptanceCriteriaVersions } from "@oc/shared";
import { describe, expect, it } from "vitest";
import {
  resumeRequirementAfterGate,
  startRequirement,
  submitRequirementAnswers,
} from "./engine.js";
import { resetGraphCheckpointerForTests } from "../graph/checkpointer.js";
import { setupWorkflowTest } from "../test-utils.js";

describe("requirement workflow engine — M3", () => {
  it("runs at least one question round for vague input", async () => {
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      const result = await startRequirement(deps, {
        projectId,
        requirement: "做一个 todo 应用",
        profile: "vague",
      });

      expect(result.phase).toBe("awaiting_answers");
      expect(result.projectStatus).toBe("Asking Questions");
      expect(result.questions?.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("creates requirement_confirm gate after complete input", async () => {
    const { deps, projectId, db, cleanup } = setupWorkflowTest();
    try {
      const result = await startRequirement(deps, {
        projectId,
        requirement: "完整的 todo 应用需求",
        profile: "complete",
      });

      expect(result.phase).toBe("awaiting_gate");
      expect(result.projectStatus).toBe("PRD Ready");
      expect(result.gateId).toBeTruthy();
      expect(result.gateOptions).toContain("approve");
      expect(result.state.prdVersion).toBeTruthy();
      expect(result.state.acceptanceCriteriaVersion).toBeTruthy();

      const prdRows = db.select().from(prdVersions).where(eq(prdVersions.project_id, projectId)).all();
      const acRows = db
        .select()
        .from(acceptanceCriteriaVersions)
        .where(eq(acceptanceCriteriaVersions.project_id, projectId))
        .all();
      expect(prdRows).toHaveLength(1);
      expect(acRows).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("approves requirement_confirm and completes requirement workflow", async () => {
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      await startRequirement(deps, {
        projectId,
        requirement: "完整的 todo 应用需求",
        profile: "complete",
      });

      const result = await resumeRequirementAfterGate(deps, {
        projectId,
        decision: "approve",
      });

      expect(result.phase).toBe("completed");
      expect(result.projectStatus).toBe("PRD Ready");
    } finally {
      cleanup();
    }
  });

  it("re-scores after answers and can reach PRD Ready", async () => {
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      await startRequirement(deps, {
        projectId,
        requirement: "做一个应用",
        profile: "improving",
      });

      let result = await submitRequirementAnswers(deps, {
        projectId,
        answers: ["个人用户", "需要任务管理"],
      });
      if (result.phase === "awaiting_answers") {
        result = await submitRequirementAnswers(deps, {
          projectId,
          answers: ["移动端也要支持"],
        });
      }

      expect(result.phase).toBe("awaiting_gate");
      expect(result.projectStatus).toBe("PRD Ready");
      expect(result.gateOptions).toContain("approve");
    } finally {
      cleanup();
    }
  });

  it("falls back to legacy resume when graph checkpoint is missing after restart", async () => {
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      const started = await startRequirement(deps, {
        projectId,
        requirement: "做一个应用",
        profile: "improving",
      });
      expect(started.phase).toBe("awaiting_answers");

      resetGraphCheckpointerForTests();

      const resumed = await submitRequirementAnswers(deps, {
        projectId,
        answers: ["个人用户", "需要任务管理"],
      });

      expect(["awaiting_answers", "completed"]).toContain(resumed.phase);
      expect(resumed.projectStatus).not.toBe("Failed");
    } finally {
      cleanup();
    }
  });
});
