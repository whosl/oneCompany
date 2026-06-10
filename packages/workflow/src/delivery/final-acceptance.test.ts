import { describe, expect, it } from "vitest";
import { handleFinalAcceptanceDecision, type FinalAcceptanceDeps } from "./final-acceptance.js";
import { setupTestingTest } from "../test-utils.js";

describe("final acceptance", () => {
  it("clears reportGenerated after reject_and_redo", () => {
    const { db, deps, projectId, cleanup } = setupTestingTest();
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

      handleFinalAcceptanceDecision(deps as FinalAcceptanceDeps, {
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
});
