import { describe, expect, it } from "vitest";
import { integrationToolCalls } from "@oc/shared";
import { seedTestProject, setupIntegrationTestDb } from "../../../integrations/src/test-utils.js";
import { runPreviewIntegrationChecks } from "./hooks.js";

describe("runPreviewIntegrationChecks", () => {
  it("auto-enables playwright and records mock verification artifacts", async () => {
    const previousMode = process.env.OC_INTEGRATION_ADAPTER_MODE;
    process.env.OC_INTEGRATION_ADAPTER_MODE = "mock";
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      const summary = await runPreviewIntegrationChecks(
        {
          db,
          projectId,
          callIntegration: { db, projectId, caller: "workflow" },
        },
        "http://127.0.0.1:4173",
        "baseline",
      );

      expect(summary.artifacts).toHaveLength(2);
      expect(summary.artifacts.map((item) => item.toolName).sort()).toEqual([
        "console_errors",
        "screenshot",
      ]);
      expect(summary.notes.length).toBe(2);
      expect(db.select().from(integrationToolCalls).all().length).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
      if (previousMode === undefined) {
        delete process.env.OC_INTEGRATION_ADAPTER_MODE;
      } else {
        process.env.OC_INTEGRATION_ADAPTER_MODE = previousMode;
      }
    }
  });
});
