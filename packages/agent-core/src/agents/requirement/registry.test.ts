import { describe, expect, it } from "vitest";
import { getAgent } from "../../registry.js";
import { setupTestDb } from "../../test-utils.js";
import { registerRequirementAgents, REQUIREMENT_AGENT_IDS } from "./definitions.js";

describe("requirement agent registry — M3", () => {
  it("registers all five requirement agents", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerRequirementAgents(db);
      expect(getAgent(db, REQUIREMENT_AGENT_IDS.intake).id).toBe("intake");
      expect(getAgent(db, REQUIREMENT_AGENT_IDS.analyst).id).toBe("requirement-analyst");
      expect(getAgent(db, REQUIREMENT_AGENT_IDS.scorer).id).toBe("completeness-scorer");
      expect(getAgent(db, REQUIREMENT_AGENT_IDS.questionPlanner).id).toBe("question-planner");
      expect(getAgent(db, REQUIREMENT_AGENT_IDS.prdAcceptance).id).toBe("prd-acceptance");
    } finally {
      cleanup();
    }
  });
});
