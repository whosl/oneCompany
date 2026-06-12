import { describe, expect, it } from "vitest";
import { getConnectionForProject } from "@oc/integrations";
import { seedIntegrationTestProject, setupIntegrationTestDb } from "./test-utils.js";
import { applyRequirementIntegrations } from "./requirement-enable.js";

describe("applyRequirementIntegrations", () => {
  it("enables normalized integrations for the project", async () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedIntegrationTestProject(db);
      const result = await applyRequirementIntegrations(
        { db, projectId },
        ["GitHub", "unknown-service"],
      );

      expect(result.normalizedIntegrations).toEqual(["github"]);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(getConnectionForProject(db, projectId, "github")?.integrationId).toBe("github");
    } finally {
      cleanup();
    }
  });
});
