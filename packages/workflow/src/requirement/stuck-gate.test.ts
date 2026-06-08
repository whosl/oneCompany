import { eq } from "drizzle-orm";
import { humanGates } from "@oc/shared";
import { describe, expect, it } from "vitest";
import {
  resumeRequirementAfterGate,
  startRequirement,
  submitRequirementAnswers,
} from "./engine.js";
import { STUCK_BUDGET_EXTENSION } from "./types.js";
import { loadRequirementSession } from "./state.js";
import { setupWorkflowTest } from "../test-utils.js";

async function resolveGate(db: import("@oc/shared").Db, gateId: string, decision: string) {
  db.update(humanGates)
    .set({
      status: "resolved",
      decision,
      resolved_at: new Date().toISOString(),
    })
    .where(eq(humanGates.id, gateId))
    .run();
}

describe("requirement stuck gate — M3", () => {
  it("raises a stuck gate for low-improvement answers", async () => {
    const { deps, projectId, cleanup } = setupWorkflowTest();
    try {
      let result = await startRequirement(deps, {
        projectId,
        requirement: "模糊需求",
        profile: "stuck",
      });
      expect(result.phase).toBe("awaiting_answers");

      result = await submitRequirementAnswers(deps, {
        projectId,
        answers: ["answer 1"],
      });
      if (result.phase === "awaiting_answers") {
        result = await submitRequirementAnswers(deps, {
          projectId,
          answers: ["answer 2"],
        });
      }

      expect(result.phase).toBe("awaiting_gate");
      expect(result.gateId).toBeTruthy();
      expect(result.gateOptions).toEqual([
        "keep_answering",
        "force_continue",
        "fail",
      ]);
    } finally {
      cleanup();
    }
  });

  it("extends budget on keep_answering", async () => {
    const { deps, projectId, db, cleanup } = setupWorkflowTest();
    try {
      let result = await startRequirement(deps, {
        projectId,
        requirement: "模糊需求",
        profile: "stuck",
      });
      result = await submitRequirementAnswers(deps, { projectId, answers: ["a1"] });
      if (result.phase === "awaiting_answers") {
        result = await submitRequirementAnswers(deps, { projectId, answers: ["a2"] });
      }

      const before = loadRequirementSession(db, projectId).state.maxQuestionRounds;
      await resolveGate(db, result.gateId!, "keep_answering");
      result = await resumeRequirementAfterGate(deps, {
        projectId,
        decision: "keep_answering",
      });

      const after = loadRequirementSession(db, projectId).state.maxQuestionRounds;
      expect(after).toBe(before + STUCK_BUDGET_EXTENSION);
      expect(result.phase === "awaiting_answers" || result.phase === "awaiting_gate").toBe(
        true,
      );
    } finally {
      cleanup();
    }
  });

  it("force_continue records a risk and reaches PRD Ready", async () => {
    const { deps, projectId, db, cleanup } = setupWorkflowTest();
    try {
      let result = await startRequirement(deps, {
        projectId,
        requirement: "模糊需求",
        profile: "stuck",
      });
      result = await submitRequirementAnswers(deps, { projectId, answers: ["a1"] });
      if (result.phase === "awaiting_answers") {
        result = await submitRequirementAnswers(deps, { projectId, answers: ["a2"] });
      }

      await resolveGate(db, result.gateId!, "force_continue");
      result = await resumeRequirementAfterGate(deps, {
        projectId,
        decision: "force_continue",
      });

      expect(result.phase).toBe("completed");
      expect(result.projectStatus).toBe("PRD Ready");
      expect(result.state.risks.some((risk) => risk.includes("force-continue"))).toBe(
        true,
      );
    } finally {
      cleanup();
    }
  });

  it("fail moves the project to Failed", async () => {
    const { deps, projectId, db, cleanup } = setupWorkflowTest();
    try {
      let result = await startRequirement(deps, {
        projectId,
        requirement: "模糊需求",
        profile: "stuck",
      });
      result = await submitRequirementAnswers(deps, { projectId, answers: ["a1"] });
      if (result.phase === "awaiting_answers") {
        result = await submitRequirementAnswers(deps, { projectId, answers: ["a2"] });
      }

      await resolveGate(db, result.gateId!, "fail");
      result = await resumeRequirementAfterGate(deps, {
        projectId,
        decision: "fail",
      });

      expect(result.phase).toBe("failed");
      expect(result.projectStatus).toBe("Failed");
    } finally {
      cleanup();
    }
  });
});
