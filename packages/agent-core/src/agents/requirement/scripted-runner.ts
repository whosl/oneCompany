import {
  AnalystOutputSchema,
  IntakeOutputSchema,
  PrdAcceptanceOutputSchema,
  QuestionPlannerOutputSchema,
  ScorerOutputSchema,
} from "@oc/shared";
import { REQUIREMENT_AGENT_IDS } from "./definitions.js";
import type { RequirementAgentTask, RequirementFixtureProfile } from "./types.js";

function scoreForProfile(profile: RequirementFixtureProfile, roundIndex: number): number {
  switch (profile) {
    case "complete":
      return 90;
    case "vague":
      return 65;
    case "stuck":
      return 70 + roundIndex;
    case "improving":
      return Math.min(70 + roundIndex * 10, 95);
    default:
      return 65;
  }
}

function gapsForProfile(profile: RequirementFixtureProfile) {
  if (profile === "complete") {
    return [];
  }
  return [
    {
      topic: "users",
      severity: "medium" as const,
      question: "Who are the primary users?",
    },
  ];
}

export function runScriptedRequirementAgent(
  agentIdAtVersion: string,
  task: RequirementAgentTask,
): unknown {
  const { state, profile } = task;
  const roundIndex = state.questionRounds.length;

  switch (agentIdAtVersion) {
    case REQUIREMENT_AGENT_IDS.intake:
      return IntakeOutputSchema.parse({
        normalizedSummary: `Normalized: ${state.rawRequirement}`,
        targetUsers: profile === "complete" ? ["power users"] : ["general users"],
        userGoals: ["complete the described workflow"],
        appType: "web",
        missingContext: profile === "complete" ? [] : ["deployment target"],
      });

    case REQUIREMENT_AGENT_IDS.analyst:
      return AnalystOutputSchema.parse({
        coreFeatures: ["create items", "mark complete"],
        pagesAndFlows: [
          {
            name: "Home",
            purpose: "Primary workspace",
            userActions: ["create", "complete"],
          },
        ],
        dataObjects: [{ name: "Item", fields: ["id", "title", "done"] }],
        rolesAndPermissions: ["owner"],
        integrations: [],
        nonFunctionalRequirements: ["responsive layout"],
        assumptions: ["single-tenant MVP"],
      });

    case REQUIREMENT_AGENT_IDS.scorer:
      return ScorerOutputSchema.parse({
        completenessScore: scoreForProfile(profile, roundIndex),
        gaps: gapsForProfile(profile),
      });

    case REQUIREMENT_AGENT_IDS.questionPlanner:
      return QuestionPlannerOutputSchema.parse({
        topic: "Target users",
        questions: [
          {
            question: "Who is the primary user?",
            suggestedAnswers: [
              "Individual developers on a single machine",
              "Small teams sharing one workspace",
              "Enterprise admins managing many users",
            ],
          },
          {
            question: "What is the main workflow they need?",
            suggestedAnswers: [
              "Add, list, and complete items quickly",
              "Track long-running multi-step projects",
              "Review history and audit changes",
            ],
          },
        ],
      });

    case REQUIREMENT_AGENT_IDS.prdAcceptance:
      return PrdAcceptanceOutputSchema.parse({
        prd: `# PRD for ${state.normalizedSummary}\n\n## Goals\n${state.userGoals.join(", ")}`,
        acceptanceCriteria: "- User can create and complete items\n- UI is responsive",
        assumptions: state.assumptions,
        risks: state.risks,
      });

    default:
      throw new Error(`Unknown requirement agent: ${agentIdAtVersion}`);
  }
}
