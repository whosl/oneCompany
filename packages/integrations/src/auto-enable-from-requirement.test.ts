import { describe, expect, it } from "vitest";
import { events } from "@oc/shared";
import { autoEnableIntegrationsFromRequirement } from "./auto-enable-from-requirement.js";
import { getConnectionForProject } from "./connection.js";
import { seedTestProject, setupIntegrationTestDb } from "./test-utils.js";

describe("autoEnableIntegrationsFromRequirement", () => {
  it("normalizes aliases, enables registered integrations, and emits warnings", async () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      const emitted: string[] = [];

      const result = await autoEnableIntegrationsFromRequirement(db, {
        projectId,
        requirementIntegrations: ["Browser MCP", "figma", "stripe"],
        onEvent: (envelope) => {
          if (envelope.payload.type === "agent.observe") {
            emitted.push(envelope.payload.summary);
          }
        },
      });

      expect(result.normalized).toEqual(["playwright", "figma"]);
      expect(result.enabled).toEqual(["playwright", "figma"]);
      expect(result.unknown).toEqual(["stripe"]);
      expect(getConnectionForProject(db, projectId, "playwright")?.status).not.toBe("not_configured");
      expect(getConnectionForProject(db, projectId, "figma")?.status).not.toBe("not_configured");
      expect(emitted.some((line) => line.includes("stripe"))).toBe(true);
      expect(db.select().from(events).all().length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });
});
