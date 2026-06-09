import { describe, expect, it } from "vitest";
import { createRequirementRunner } from "./runner-factory.js";
import { runScriptedRequirementAgent } from "./agents/requirement/scripted-runner.js";
import { REQUIREMENT_AGENT_IDS } from "./agents/requirement/definitions.js";
import type { RequirementAgentTask } from "./agents/requirement/types.js";

describe("runner factory — M9.5", () => {
  it("uses scripted runner in stub mode", async () => {
    const task: RequirementAgentTask = {
      profile: "complete",
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

    const runner = createRequirementRunner({} as never, { mode: "stub", requirementProfile: "complete" });
    const result = await runner(REQUIREMENT_AGENT_IDS.scorer, task);
    const expected = runScriptedRequirementAgent(REQUIREMENT_AGENT_IDS.scorer, task);
    expect(result.output).toEqual(expected);
  });
});
