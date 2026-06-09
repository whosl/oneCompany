import { describe, expect, it } from "vitest";
import { enableIntegrationForProject } from "@oc/integrations";
import { buildIntegrationReportNotes } from "./report-integrations.js";
import { seedProject, setupTestDb } from "../test-utils.js";

describe("delivery report integrations — M12", () => {
  it("records offline fallback integrations in report notes", async () => {
    const previous = process.env.OC_OFFLINE_MODE;
    process.env.OC_OFFLINE_MODE = "1";
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "github",
        scopes: ["repo:read"],
      });
      const notes = buildIntegrationReportNotes(db, projectId);
      expect(notes.some((note) => note.includes("github"))).toBe(true);
      expect(notes.some((note) => note.includes("OC_OFFLINE_MODE"))).toBe(true);
    } finally {
      cleanup();
      if (previous === undefined) {
        delete process.env.OC_OFFLINE_MODE;
      } else {
        process.env.OC_OFFLINE_MODE = previous;
      }
    }
  });
});
