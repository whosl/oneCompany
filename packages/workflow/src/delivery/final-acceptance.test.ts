import { describe, expect, it } from "vitest";
import { handleFinalAcceptanceDecision, type FinalAcceptanceDeps } from "./final-acceptance.js";
import { setupTestingTest } from "../test-utils.js";

describe("final acceptance", () => {
  it("clears reportGenerated after reject_and_redo", () => {
    const { deps, projectId, cleanup } = setupTestingTest();
    try {
      deps.setStatus(projectId, "Awaiting Acceptance", "test");
      const payload = deps.loadSession(projectId);
      deps.saveSession(projectId, {
        ...payload,
        delivery: {
          phase: "awaiting_final_acceptance",
          gateId: "gate-final",
          reportGenerated: true,
        },
      });

      handleFinalAcceptanceDecision(deps as unknown as FinalAcceptanceDeps, {
        projectId,
        decision: "reject_and_redo",
      });

      const next = deps.loadSession(projectId);
      expect(next.delivery?.reportGenerated).toBe(false);
      expect(next.delivery?.phase).toBe("idle");
    } finally {
      cleanup();
    }
  });

  it("records feedback and opens change review when startChangeReview is provided", () => {
    const { deps, projectId, cleanup } = setupTestingTest();
    try {
      deps.setStatus(projectId, "Awaiting Acceptance", "test");
      const payload = deps.loadSession(projectId);
      deps.saveSession(projectId, {
        ...payload,
        delivery: {
          phase: "awaiting_final_acceptance",
          gateId: "gate-final",
          reportGenerated: true,
        },
      });

      const reviews: Array<{ summary: string }> = [];
      handleFinalAcceptanceDecision(
        {
          ...(deps as unknown as FinalAcceptanceDeps),
          startChangeReview: (_pid, input) => {
            reviews.push(input);
          },
        },
        {
          projectId,
          decision: "reject_and_redo:五子棋落点应在交叉点",
        },
      );

      expect(reviews).toEqual([
        {
          summary: "五子棋落点应在交叉点",
          details: "Rejected at final acceptance — rework requested",
        },
      ]);
      const next = deps.loadSession(projectId);
      expect(next.state.risks.some((r) => r.includes("五子棋落点应在交叉点"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
