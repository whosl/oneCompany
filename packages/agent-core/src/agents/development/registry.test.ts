import { describe, expect, it } from "vitest";
import { getAgent } from "../../registry.js";
import { DEVELOPMENT_AGENT_DEFINITIONS, registerDevelopmentAgents } from "./definitions.js";
import { setupTestDb } from "../../test-utils.js";

describe("development agent registry", () => {
  // Test Designer was merged into Planner in the TUI consolidation commit:
  // planner.ts now loads the tech plan and emits per-slice test commands directly,
  // so the scripted Test Designer step (and its definition) were intentionally removed.
  it("registers 6 development agents resolvable by id@version", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerDevelopmentAgents(db);
      expect(DEVELOPMENT_AGENT_DEFINITIONS).toHaveLength(6);
      for (const definition of DEVELOPMENT_AGENT_DEFINITIONS) {
        const resolved = getAgent(db, `${definition.id}@${definition.version}`);
        expect(resolved.id).toBe(definition.id);
        expect(resolved.group).toBe("development");
      }
    } finally {
      cleanup();
    }
  });
});
