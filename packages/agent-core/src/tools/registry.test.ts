import { describe, expect, it, beforeEach } from "vitest";
import { events } from "@oc/shared";
import { eq } from "drizzle-orm";
import { bindAgentTools } from "./bind-tools.js";
import {
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
});
