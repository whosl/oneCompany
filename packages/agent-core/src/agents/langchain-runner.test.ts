import { describe, expect, it, vi, beforeEach } from "vitest";
import { DEVELOPMENT_AGENT_IDS } from "./development/definitions.js";
import { registerDevelopmentAgents } from "./development/definitions.js";
import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import type { DevAgentTask } from "./development/types.js";
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
          clarificationSkipped: false,
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

  it("retries structured output when the first invoke returns null", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      registerDevelopmentAgents(db);
      invokeMock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          techPlan: "# Stack",
          stack: ["typescript"],
          architectureNotes: ["json storage"],
          risks: ["scope creep"],
          plan: "Draft tech plan",
          observation: "Read PRD inputs",
          reflection: "Ready to plan",
        });

      const { runLangChainDevAgent } = await import("./langchain-runner.js");
      const task = {
        profile: "minimal",
        state: {
          projectId: "p1",
          repoPath: "/tmp/repo",
          worktreePath: "/tmp/repo",
          sandboxMode: "local",
          techPlanVersion: "tp-1",
          taskQueue: [],
          currentTask: undefined,
          currentSliceAttempts: 0,
          maxSliceAttempts: 3,
          testResults: [],
          diffs: [],
          commits: [],
          deliveryArtifacts: [],
          risks: [],
        },
        prd: "# PRD",
        acceptance: "- criterion",
      } satisfies DevAgentTask;

      const result = await runLangChainDevAgent(
        { projectId: "p1", db },
        DEVELOPMENT_AGENT_IDS.architect,
        task,
      );

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(result.output).toMatchObject({ techPlan: "# Stack" });
    } finally {
      cleanup();
    }
  });
});
