import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { events, integrationToolCalls } from "@oc/shared";
import { callIntegrationTool } from "./call-tool.js";
import { enableIntegrationForProject } from "./connection.js";
import { seedTestProject, setupIntegrationTestDb } from "./test-utils.js";

describe("callIntegrationTool — M12", () => {
  it("logs remote connector calls with redacted events", async () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "figma",
        scopes: ["design:read"],
      });

      const result = await callIntegrationTool(
        { db, projectId },
        { integrationId: "figma", toolName: "get_design_context" },
      );

      expect(result.mode).toBe("remote");
      const rows = db.select().from(integrationToolCalls).all();
      expect(rows).toHaveLength(1);
      const projectEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all();
      expect(projectEvents.some((row) => row.type === "tool_call.started")).toBe(true);
      expect(projectEvents.some((row) => row.type === "tool_call.output")).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("requires authorization for high-risk integration tools", async () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "vercel",
        scopes: ["deploy:preview"],
      });

      await expect(
        callIntegrationTool({ db, projectId }, { integrationId: "vercel", toolName: "create_preview_deploy" }),
      ).rejects.toThrow(/authorization/);

      const allowed = await callIntegrationTool(
        {
          db,
          projectId,
          authorizeIntegrationWrite: async () => ({ allow: true }),
        },
        { integrationId: "vercel", toolName: "create_preview_deploy" },
      );
      expect(allowed.mode).toBe("remote");
    } finally {
      cleanup();
    }
  });
});
