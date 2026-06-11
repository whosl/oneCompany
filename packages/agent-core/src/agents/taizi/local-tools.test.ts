import { eq } from "drizzle-orm";
import { projects } from "@oc/shared";
import { describe, expect, it, beforeEach } from "vitest";
import { clearToolRegistryForTests, getTool } from "../../tools/registry.js";
import {
  ensureLocalToolsRegistered,
  resetLocalToolsRegistrationForTests,
} from "../../tools/local-tools.js";
import { setupTestDb, seedProject } from "../../test-utils.js";
import {
  ensureTaiziToolsRegistered,
  resetTaiziToolsRegistrationForTests,
  TAIZI_TOOL_IDS,
} from "./local-tools.js";

describe("taizi local tools", () => {
  beforeEach(() => {
    clearToolRegistryForTests();
    resetLocalToolsRegistrationForTests();
    resetTaiziToolsRegistrationForTests();
    ensureLocalToolsRegistered();
    ensureTaiziToolsRegistered();
  });

  it("project-overview returns project row", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db, "Taizi Demo");
      db.update(projects).set({ status: "Developing" }).where(eq(projects.id, projectId)).run();

      const tool = getTool(TAIZI_TOOL_IDS.projectOverview);
      const result = (await tool.impl({}, { db, projectId })) as {
        name: string;
        status: string;
      };
      expect(result.name).toBe("Taizi Demo");
      expect(result.status).toBe("Developing");
    } finally {
      cleanup();
    }
  });
});
