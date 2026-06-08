import { describe, expect, it } from "vitest";
import { getAgent } from "../../registry.js";
import { DEVELOPMENT_AGENT_DEFINITIONS, registerDevelopmentAgents } from "./definitions.js";
import { setupTestDb } from "../../test-utils.js";

describe("development agent registry", () => {
  it("registers 7 development agents resolvable by id@version", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerDevelopmentAgents(db);
      expect(DEVELOPMENT_AGENT_DEFINITIONS).toHaveLength(7);
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
