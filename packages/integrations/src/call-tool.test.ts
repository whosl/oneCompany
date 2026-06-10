import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { events, integrationToolCalls } from "@oc/shared";
import { callIntegrationTool } from "./call-tool.js";
import { enableIntegrationForProject } from "./connection.js";
import { seedTestProject, setupIntegrationTestDb } from "./test-utils.js";

const SKILL_PACKS_ROOT = path.resolve(process.cwd(), "../../skill-packs");

describe("callIntegrationTool — M12", () => {
  const savedAdapterMode = process.env.OC_INTEGRATION_ADAPTER_MODE;

  beforeEach(() => {
    process.env.OC_INTEGRATION_ADAPTER_MODE = "mock";
  });

  afterEach(() => {
    if (savedAdapterMode === undefined) {
      delete process.env.OC_INTEGRATION_ADAPTER_MODE;
    } else {
      process.env.OC_INTEGRATION_ADAPTER_MODE = savedAdapterMode;
    }
  });

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

  it("suppresses tool_call events when caller is opencode", async () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "figma",
        scopes: ["design:read"],
      });

      await callIntegrationTool(
        { db, projectId, caller: "opencode" },
        { integrationId: "figma", toolName: "get_design_context" },
      );

      const projectEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all();
      expect(projectEvents.some((row) => row.type === "tool_call.started")).toBe(false);
      expect(db.select().from(integrationToolCalls).all()).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("falls back offline in real mode when secrets are missing", async () => {
    const previousMode = process.env.OC_INTEGRATION_ADAPTER_MODE;
    const previousToken = process.env.FIGMA_ACCESS_TOKEN;
    process.env.OC_INTEGRATION_ADAPTER_MODE = "real";
    delete process.env.FIGMA_ACCESS_TOKEN;

    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "figma",
        scopes: ["design:read"],
      });

      const result = await callIntegrationTool(
        { db, projectId, skillPacksRoot: SKILL_PACKS_ROOT },
        { integrationId: "figma", toolName: "get_design_context" },
      );

      expect(result.mode).toBe("offline");
    } finally {
      if (previousMode === undefined) delete process.env.OC_INTEGRATION_ADAPTER_MODE;
      else process.env.OC_INTEGRATION_ADAPTER_MODE = previousMode;
      if (previousToken === undefined) delete process.env.FIGMA_ACCESS_TOKEN;
      else process.env.FIGMA_ACCESS_TOKEN = previousToken;
      cleanup();
    }
  });

  it("returns pending when async gate mode is enabled", async () => {
    const previousGateMode = process.env.OC_INTEGRATION_GATE_MODE;
    process.env.OC_INTEGRATION_GATE_MODE = "async";

    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "vercel",
        scopes: ["deploy:preview"],
      });

      const result = await callIntegrationTool(
        {
          db,
          projectId,
          authorizeIntegrationWrite: async () => ({
            pending: true,
            gateId: "gate-test",
            message: "waiting for approval",
          }),
        },
        { integrationId: "vercel", toolName: "create_preview_deploy" },
      );

      expect(result.mode).toBe("pending");
      expect(result.gateId).toBe("gate-test");
    } finally {
      if (previousGateMode === undefined) delete process.env.OC_INTEGRATION_GATE_MODE;
      else process.env.OC_INTEGRATION_GATE_MODE = previousGateMode;
      cleanup();
    }
  });
});
