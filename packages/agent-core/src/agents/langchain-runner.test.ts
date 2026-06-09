import { describe, expect, it, vi, beforeEach } from "vitest";
import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import type { RequirementAgentTask } from "./requirement/types.js";
import { registerRequirementAgents } from "./requirement/definitions.js";
import { setupTestDb } from "../test-utils.js";

const invokeMock = vi.fn();

vi.mock("../llm/langchain-model.js", () => ({
  createChatModel: () => ({
    withStructuredOutput: () => ({
      invoke: invokeMock,
    }),
  }),
}));

describe("langchain runner — M9.5", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns parsed output and reasoning fields", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerRequirementAgents(db);
      invokeMock.mockResolvedValue({
        completenessScore: 72,
        gaps: [{ topic: "auth", severity: "medium", question: "Who logs in?" }],
        plan: "Score requirement completeness",
        observation: "Reviewed normalized requirement state",
        reflection: "Found auth gap",
      });

      const { runLangChainRequirementAgent } = await import("./langchain-runner.js");
      const task: RequirementAgentTask = {
        profile: "vague",
        state: {
          projectId: "p1",
          rawRequirement: "todo app",
          normalizedSummary: "todo app",
          completenessThreshold: 85,
          maxQuestionRounds: 6,
          questionRounds: [],
          completenessScore: 0,
          targetUsers: [],
          userGoals: [],
          coreFeatures: [],
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

      const result = await runLangChainRequirementAgent(
        { projectId: "p1", db },
        REQUIREMENT_AGENT_IDS.scorer,
        task,
      );

      expect(result.output).toEqual({
        completenessScore: 72,
        gaps: [{ topic: "auth", severity: "medium", question: "Who logs in?" }],
      });
      expect(result.reasoning.plan).toBe("Score requirement completeness");
      expect(result.modelId).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});
