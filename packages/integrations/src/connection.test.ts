import { describe, expect, it } from "vitest";
import { enableIntegrationForProject, getConnectionForProject } from "./connection.js";
import { seedTestProject, setupIntegrationTestDb } from "./test-utils.js";

describe("integration connections — M12", () => {
  it("enables an integration for a project", async () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      const connection = await enableIntegrationForProject(db, {
        projectId,
        integrationId: "github",
        scopes: ["repo:read"],
      });
      expect(connection.status).toBe("connected");
      expect(getConnectionForProject(db, projectId, "github")?.scopes).toEqual(["repo:read"]);
    } finally {
      cleanup();
    }
  });
});
