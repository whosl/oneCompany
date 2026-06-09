import {
  AnalystOutputSchema,
  ArchitectOutputSchema,
  CodingOutputSchema,
  DevopsDeliveryOutputSchema,
  IntakeOutputSchema,
  PlannerOutputSchema,
  PrdAcceptanceOutputSchema,
  QaOutputSchema,
  QuestionPlannerOutputSchema,
  ReviewOutputSchema,
  ScorerOutputSchema,
  TestDesignerOutputSchema,
  type Db,
} from "@oc/shared";
import { callOpenAiChatJson } from "../llm/openai-client.js";
import { getAgent } from "../registry.js";
import { pickModel } from "../router.js";
import { DEVELOPMENT_AGENT_IDS } from "./development/definitions.js";
import type { DevAgentTask } from "./development/types.js";
import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import type { RequirementAgentTask } from "./requirement/types.js";

function systemPrompt(role: string, description: string, outputHint: string): string {
  return [
    `You are ${role}.`,
    description,
    "Respond with a single JSON object only.",
    outputHint,
  ].join(" ");
}

export async function runOpenAiRequirementAgent(
  db: Db,
  agentIdAtVersion: string,
  task: RequirementAgentTask,
): Promise<unknown> {
  const agent = getAgent(db, agentIdAtVersion);
  const model = pickModel(agent.modelPolicy.tier);
  const raw = await callOpenAiChatJson({
    model,
    system: systemPrompt(agent.role, agent.description, "Match the requirement agent output schema."),
    user: JSON.stringify({ state: task.state }),
  });

  switch (agentIdAtVersion) {
    case REQUIREMENT_AGENT_IDS.intake:
      return IntakeOutputSchema.parse(raw);
    case REQUIREMENT_AGENT_IDS.analyst:
      return AnalystOutputSchema.parse(raw);
    case REQUIREMENT_AGENT_IDS.scorer:
      return ScorerOutputSchema.parse(raw);
    case REQUIREMENT_AGENT_IDS.questionPlanner:
      return QuestionPlannerOutputSchema.parse(raw);
    case REQUIREMENT_AGENT_IDS.prdAcceptance:
      return PrdAcceptanceOutputSchema.parse(raw);
    default:
      throw new Error(`Unknown requirement agent: ${agentIdAtVersion}`);
  }
}

export async function runOpenAiDevAgent(
  db: Db,
  agentIdAtVersion: string,
  task: DevAgentTask,
): Promise<unknown> {
  const agent = getAgent(db, agentIdAtVersion);
  const model = pickModel(agent.modelPolicy.tier);
  const raw = await callOpenAiChatJson({
    model,
    system: systemPrompt(agent.role, agent.description, "Match the development agent output schema."),
    user: JSON.stringify(task),
  });

  switch (agentIdAtVersion) {
    case DEVELOPMENT_AGENT_IDS.architect:
      return ArchitectOutputSchema.parse(raw);
    case DEVELOPMENT_AGENT_IDS.testDesigner:
      return TestDesignerOutputSchema.parse(raw);
    case DEVELOPMENT_AGENT_IDS.planner:
      return PlannerOutputSchema.parse(raw);
    case DEVELOPMENT_AGENT_IDS.coding:
      return CodingOutputSchema.parse(raw);
    case DEVELOPMENT_AGENT_IDS.review:
      return ReviewOutputSchema.parse(raw);
    case DEVELOPMENT_AGENT_IDS.qa:
      return QaOutputSchema.parse(raw);
    case DEVELOPMENT_AGENT_IDS.devopsDelivery:
      return DevopsDeliveryOutputSchema.parse(raw);
    default:
      throw new Error(`Unknown development agent: ${agentIdAtVersion}`);
  }
}
