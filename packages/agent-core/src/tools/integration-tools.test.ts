import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enableIntegrationForProject } from "@oc/integrations";
import { getAgent } from "../registry.js";
import { registerDevelopmentAgents } from "../agents/development/definitions.js";
import { DEVELOPMENT_AGENT_IDS } from "../agents/development/definitions.js";
import { setupTestDb, seedProject } from "../test-utils.js";
import {
  buildIntegrationLangChainTools,
  qaIntegrationToolsEnabled,
} from "./integration-tools.js";

const SKILL_PACKS_ROOT = path.resolve(process.cwd(), "../../skill-packs");

describe("integration-tools — PR-C2", () => {
  const savedQaFlag = process.env.OC_QA_INTEGRATION_TOOLS;
  const savedAdapterMode = process.env.OC_INTEGRATION_ADAPTER_MODE;

  beforeEach(() => {
    process.env.OC_INTEGRATION_ADAPTER_MODE = "mock";
    delete process.env.OC_QA_INTEGRATION_TOOLS;
  });

  afterEach(() => {
    if (savedQaFlag === undefined) {
      delete process.env.OC_QA_INTEGRATION_TOOLS;
    } else {
      process.env.OC_QA_INTEGRATION_TOOLS = savedQaFlag;
    }
    if (savedAdapterMode === undefined) {
      delete process.env.OC_INTEGRATION_ADAPTER_MODE;
    } else {
      process.env.OC_INTEGRATION_ADAPTER_MODE = savedAdapterMode;
    }
  });

  it("enables QA integration tools by default", () => {
    expect(qaIntegrationToolsEnabled()).toBe(true);
    process.env.OC_QA_INTEGRATION_TOOLS = "0";
    expect(qaIntegrationToolsEnabled()).toBe(false);
  });

  it("returns no tools without callIntegration deps", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerDevelopmentAgents(db);
      const agent = getAgent(db, DEVELOPMENT_AGENT_IDS.qa);
      const tools = buildIntegrationLangChainTools(agent, {
        db,
        projectId: seedProject(db),
        enabledIntegrationIds: ["playwright"],
      });
      expect(tools).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("binds governed playwright tools for QA and filters high-risk navigate", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerDevelopmentAgents(db);
      const projectId = seedProject(db);
      const agent = getAgent(db, DEVELOPMENT_AGENT_IDS.qa);

      const tools = buildIntegrationLangChainTools(agent, {
        db,
        projectId,
        enabledIntegrationIds: ["playwright"],
        callIntegration: {
          db,
          projectId,
          artifactsPath: "/tmp/oc-artifacts",
          skillPacksRoot: SKILL_PACKS_ROOT,
          caller: "agent",
        },
      });

      const names = tools.map((tool) => tool.name).sort();
      expect(names).toEqual([
        "integration__playwright__console_errors",
        "integration__playwright__screenshot",
      ]);
      expect(names).not.toContain("integration__playwright__navigate");
    } finally {
      cleanup();
    }
  });

  it("invokes callIntegrationTool through a bound tool", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerDevelopmentAgents(db);
      const projectId = seedProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "playwright",
        scopes: ["read", "network"],
      });
      const agent = getAgent(db, DEVELOPMENT_AGENT_IDS.qa);

      const tools = buildIntegrationLangChainTools(agent, {
        db,
        projectId,
        enabledIntegrationIds: ["playwright"],
        callIntegration: {
          db,
          projectId,
          artifactsPath: "/tmp/oc-artifacts",
          skillPacksRoot: SKILL_PACKS_ROOT,
          caller: "agent",
        },
        task: {
          state: { projectId },
          profile: "default",
          testingContext: { previewUrl: "http://127.0.0.1:4173" },
        },
      });

      const screenshot = tools.find((tool) => tool.name.endsWith("__screenshot"));
      expect(screenshot).toBeDefined();
      const raw = await screenshot!.invoke({});
      const parsed = JSON.parse(String(raw)) as { mode: string; output: unknown };
      expect(parsed.mode).toBe("remote");
      expect(parsed.output).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});
