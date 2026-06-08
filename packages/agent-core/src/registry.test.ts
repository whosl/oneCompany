import { createDb } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { DUMMY_AGENT } from "./fixtures.js";
import { getAgent, listAgents, registerAgent } from "./registry.js";
import { setupTestDb } from "./test-utils.js";

describe("registry — M2", () => {
  it("registers and resolves an agent by id@version", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerAgent(db, DUMMY_AGENT);
      const agent = getAgent(db, "dummy@1.0.0");
      expect(agent.id).toBe("dummy");
      expect(agent.version).toBe("1.0.0");
    } finally {
      cleanup();
    }
  });

  it("loads registered agents from a new db connection", () => {
    const { db, cleanup } = setupTestDb();
    const dbPath = process.env.OC_TEST_DB_PATH!;
    try {
      registerAgent(db, DUMMY_AGENT);
      const second = createDb(dbPath);
      const agent = getAgent(second, "dummy@1.0.0");
      expect(agent.role).toBe("Dummy Agent");
    } finally {
      cleanup();
    }
  });

  it("throws for unknown agents", () => {
    const { db, cleanup } = setupTestDb();
    try {
      expect(() => getAgent(db, "missing@1.0.0")).toThrow(/Agent not found/);
    } finally {
      cleanup();
    }
  });

  it("lists registered agents", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerAgent(db, DUMMY_AGENT);
      const agents = listAgents(db);
      expect(agents).toHaveLength(1);
      expect(agents[0]?.id).toBe("dummy");
    } finally {
      cleanup();
    }
  });

  it("keeps multiple versions of the same agent id", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerAgent(db, DUMMY_AGENT);
      registerAgent(db, {
        ...DUMMY_AGENT,
        version: "2.0.0",
        role: "Dummy Agent v2",
      });

      expect(getAgent(db, "dummy@1.0.0").version).toBe("1.0.0");
      expect(getAgent(db, "dummy@2.0.0").version).toBe("2.0.0");
      expect(getAgent(db, "dummy@2.0.0").role).toBe("Dummy Agent v2");
      expect(listAgents(db)).toHaveLength(2);
    } finally {
      cleanup();
    }
  });
});
