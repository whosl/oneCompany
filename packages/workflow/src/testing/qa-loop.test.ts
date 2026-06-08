import { describe, expect, it } from "vitest";
import { runTestingPhase } from "./engine.js";
import { setupTestingTest } from "../test-utils.js";

describe("QA loop on testing failure", () => {
  it("appends QA notes to risks when suite fails", async () => {
    const { deps, projectId, cleanup } = setupTestingTest({
      suiteResults: { "final:playwright": "failed" },
    });
    try {
      const result = await runTestingPhase(deps, { projectId });
      expect(result.qaNotes?.some((n) => n.includes("final:playwright"))).toBe(true);
      expect(result.state.risks.some((r) => r.startsWith("QA:"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
