import { describe, expect, it, beforeEach } from "vitest";
import { events } from "@oc/shared";
import { eq } from "drizzle-orm";
import { bindAgentTools } from "./bind-tools.js";
import {
  assertAgentMayUseTool,
  clearToolRegistryForTests,
  getTool,
  registerTool,
  resolveToolsForAgent,
} from "./registry.js";
import {
  ensureLocalToolsRegistered,
  LOCAL_TOOL_IDS,
  resetLocalToolsRegistrationForTests,
} from "./local-tools.js";
import { setupTestDb, seedProject } from "../test-utils.js";
import { z } from "zod";
import type { RequirementAgentTask } from "../agents/requirement/types.js";
import { registerDevelopmentAgents, DEVELOPMENT_AGENT_IDS } from "../agents/development/definitions.js";
import { getAgent } from "../registry.js";

describe("tool registry — M9.5", () => {
  beforeEach(() => {
    clearToolRegistryForTests();
    resetLocalToolsRegistrationForTests();
    ensureLocalToolsRegistered();
  });

  it("resolves registered local tools by id@version", () => {
    const tools = resolveToolsForAgent([LOCAL_TOOL_IDS.requirementContext]);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.protocol).toBe("local");
  });

  it("binds tools through callTool governance pipeline", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      registerTool({
        id: "echo",
        version: "1.0.0",
        description: "Echo args",
        protocol: "local",
        riskLevel: "low",
        permissions: ["read"],
        argsSchema: z.object({ text: z.string() }),
        impl: async (args) => args,
      });

      const bound = bindAgentTools(
        {
          id: "test",
          version: "1.0.0",
          group: "requirement",
          role: "Test",
          description: "Test",
          inputSchema: {},
          outputSchema: {},
          tools: ["echo@1.0.0"],
          modelPolicy: { tier: "cheap" },
          riskLevel: "low",
          permissions: ["read"],
          executor: "stub",
        },
        { db, projectId },
      );

      expect(bound).toHaveLength(1);
      await bound[0]!.invoke({ text: "hello" });

      const types = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => row.type);

      expect(types).toContain("tool_call.started");
      expect(types).toContain("tool_call.output");

      const started = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .find((row) => row.type === "tool_call.started");
      expect(started?.agent_id).toBe("test");
    } finally {
      cleanup();
    }
  });

  it("requirement-context tool reads task state", async () => {
    const tool = getTool(LOCAL_TOOL_IDS.requirementContext);
    const task: RequirementAgentTask = {
      profile: "vague",
      state: {
        projectId: "p1",
        rawRequirement: "todo",
        normalizedSummary: "todo app",
        completenessThreshold: 85,
        maxQuestionRounds: 6,
        clarificationSkipped: false,
        questionRounds: [],
        completenessScore: 10,
        targetUsers: [],
        userGoals: [],
        coreFeatures: ["tasks"],
        pagesAndFlows: [],
        dataObjects: [],
        rolesAndPermissions: [],
        integrations: [],
        nonFunctionalRequirements: [],
        assumptions: [],
        risks: [],
        gaps: [],
      },
    };

    const output = await tool.impl({}, { db: {} as never, projectId: "p1", task });
    expect(output).toMatchObject({
      normalizedSummary: "todo app",
      completenessScore: 10,
      coreFeatures: ["tasks"],
    });
  });

  it("rejects agents that lack permissions for a tool", () => {
    registerTool({
      id: "deploy",
      version: "1.0.0",
      description: "Deploy",
      protocol: "local",
      riskLevel: "low",
      permissions: ["deploy"],
      argsSchema: z.object({}),
      impl: async () => ({}),
    });

    const tool = getTool("deploy@1.0.0");
    expect(() =>
      assertAgentMayUseTool(
        {
          id: "test",
          version: "1.0.0",
          group: "requirement",
          role: "Test",
          description: "Test",
          inputSchema: {},
          outputSchema: {},
          tools: [],
          modelPolicy: { tier: "cheap" },
          riskLevel: "low",
          permissions: ["read"],
          executor: "stub",
        },
        tool,
      ),
    ).toThrow(/lacks permission "deploy"/);
  });

  it("binds integration tools only for the QA agent when callIntegration is present", () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerDevelopmentAgents(db);
      const projectId = seedProject(db);
      const qa = getAgent(db, DEVELOPMENT_AGENT_IDS.qa);
      const planner = getAgent(db, DEVELOPMENT_AGENT_IDS.planner);

      const qaTools = bindAgentTools(qa, {
        db,
        projectId,
        enabledIntegrationIds: ["playwright", "figma"],
        callIntegration: { db, projectId, caller: "agent" },
      });
      const plannerTools = bindAgentTools(planner, {
        db,
        projectId,
        enabledIntegrationIds: ["playwright"],
        callIntegration: { db, projectId, caller: "agent" },
      });

      expect(qaTools.some((tool) => tool.name.startsWith("integration__"))).toBe(true);
      expect(plannerTools.some((tool) => tool.name.startsWith("integration__"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("workspace-read blocks path traversal outside repo root", async () => {
    const tool = getTool(LOCAL_TOOL_IDS.workspaceRead);
    const repoPath = "/tmp/oc-workspace-test-repo";
    const output = await tool.impl(
      { relativePath: "../outside.txt" },
      { db: {} as never, projectId: "p1", repoPath },
    );
    expect(output).toMatchObject({ error: "Path escapes project root" });
  });
});
