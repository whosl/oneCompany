import { eq } from "drizzle-orm";
import { prdVersions, acceptanceCriteriaVersions } from "@oc/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  resumeRequirementAfterGate,
  skipRequirementClarification,
  startRequirement,
  submitRequirementAnswers,
} from "./engine.js";
import { resetGraphCheckpointerForTests } from "../graph/checkpointer.js";
import { setupWorkflowTest } from "../test-utils.js";

describe("requirement workflow engine — M3", () => {
  afterEach(() => {
    delete process.env.OC_MIN_TOTAL_QUESTIONS;
  });

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

  it("skips clarification with defaults and reaches PRD Ready", async () => {
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      // "vague" profile scores 65 (< 85): without skip it would keep asking.
      const started = await startRequirement(deps, {
        projectId,
        requirement: "做一个 todo 应用",
        profile: "vague",
      });
      expect(started.phase).toBe("awaiting_answers");

      const result = await skipRequirementClarification(deps, { projectId });

      expect(result.phase).toBe("awaiting_gate");
      expect(result.projectStatus).toBe("PRD Ready");
      expect(result.state.clarificationSkipped).toBe(true);
      expect(result.state.prdVersion).toBeTruthy();
      expect(
        result.state.assumptions.some((item) => item.includes("跳过澄清")),
      ).toBe(true);
      expect(
        result.state.risks.some((item) => item.includes("Clarification skipped")),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("skips clarification via legacy path when graph checkpoint is missing", async () => {
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      const started = await startRequirement(deps, {
        projectId,
        requirement: "做一个 todo 应用",
        profile: "vague",
      });
      expect(started.phase).toBe("awaiting_answers");

      resetGraphCheckpointerForTests();

      const result = await skipRequirementClarification(deps, { projectId });

      expect(result.phase).toBe("awaiting_gate");
      expect(result.projectStatus).toBe("PRD Ready");
      expect(result.state.clarificationSkipped).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("enforces the question floor before PRD when configured", async () => {
    process.env.OC_MIN_TOTAL_QUESTIONS = "6";
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      // "complete" profile scores 90 immediately, but the floor forces a round.
      const started = await startRequirement(deps, {
        projectId,
        requirement: "完整的 todo 应用需求",
        profile: "complete",
      });
      expect(started.phase).toBe("awaiting_answers");
      expect(started.questions?.length).toBeGreaterThan(0);
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
