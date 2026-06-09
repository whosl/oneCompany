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
} from "@oc/shared";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import type { AgentRunContext } from "../executor.js";
import {
  splitReasoningFromOutput,
  withReasoningFields,
  type AgentReasoningFields,
} from "../llm/agent-reasoning.js";
import { createChatModel } from "../llm/langchain-model.js";
import { getAgent } from "../registry.js";
import { pickModel } from "../router.js";
import { bindAgentTools } from "../tools/bind-tools.js";
import { DEVELOPMENT_AGENT_IDS } from "./development/definitions.js";
import type { DevAgentTask } from "./development/types.js";
import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import type { RequirementAgentTask } from "./requirement/types.js";
import { outputSchemaHint } from "./schema-hints.js";
import { runOptionalToolLoop } from "./tool-loop.js";

export type LangChainAgentResult = {
  output: unknown;
  reasoning: AgentReasoningFields;
  modelId: string;
};

function systemPrompt(role: string, description: string, outputHint: string): string {
  return [
    `You are ${role}.`,
    description,
    "You may call registered tools before producing the final JSON.",
    "Respond with a single JSON object only for the final answer.",
    "Include plan, observation, and reflection string fields alongside the task output keys.",
    outputHint,
  ].join(" ");
}

async function invokeStructuredAgent<T extends z.ZodRawShape>(
  runCtx: AgentRunContext,
  agentIdAtVersion: string,
  userPayload: unknown,
  outputSchema: z.ZodObject<T>,
  task: unknown,
): Promise<LangChainAgentResult> {
  const agent = getAgent(runCtx.db, agentIdAtVersion);
  const model = createChatModel(agent.modelPolicy.tier);
  const modelId = pickModel(agent.modelPolicy.tier);
  const schema = withReasoningFields(outputSchema);
  const structured = model.withStructuredOutput(schema, { method: "jsonMode" });

  const baseMessages = [
    new SystemMessage(
      systemPrompt(agent.role, agent.description, outputSchemaHint(agentIdAtVersion)),
    ),
    new HumanMessage(JSON.stringify(userPayload)),
  ];

  const tools = bindAgentTools(agent, {
    db: runCtx.db,
    projectId: runCtx.projectId,
    onEvent: runCtx.onEvent,
    authorize: runCtx.authorize,
    repoPath: runCtx.repoPath,
    task,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const messages =
        attempt === 0 && tools.length > 0
          ? await runOptionalToolLoop(model, baseMessages, tools)
          : baseMessages;
      const raw = await structured.invoke(messages);
      const record =
        typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
      if (!record || Object.keys(record).length === 0) {
        throw new Error("Structured agent returned empty output");
      }
      const { output, reasoning } = splitReasoningFromOutput(record);
      return {
        output: outputSchema.parse(output),
        reasoning,
        modelId,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Structured agent failed after retries: ${String(lastError)}`);
}

export async function runLangChainRequirementAgent(
  runCtx: AgentRunContext,
  agentIdAtVersion: string,
  task: RequirementAgentTask,
): Promise<LangChainAgentResult> {
  const payload = { state: task.state };

  switch (agentIdAtVersion) {
    case REQUIREMENT_AGENT_IDS.intake:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, payload, IntakeOutputSchema, task);
    case REQUIREMENT_AGENT_IDS.analyst:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, payload, AnalystOutputSchema, task);
    case REQUIREMENT_AGENT_IDS.scorer:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, payload, ScorerOutputSchema, task);
    case REQUIREMENT_AGENT_IDS.questionPlanner:
      return invokeStructuredAgent(
        runCtx,
        agentIdAtVersion,
        payload,
        QuestionPlannerOutputSchema,
        task,
      );
    case REQUIREMENT_AGENT_IDS.prdAcceptance:
      return invokeStructuredAgent(
        runCtx,
        agentIdAtVersion,
        payload,
        PrdAcceptanceOutputSchema,
        task,
      );
    default:
      throw new Error(`Unknown requirement agent: ${agentIdAtVersion}`);
  }
}

export async function runLangChainDevAgent(
  runCtx: AgentRunContext,
  agentIdAtVersion: string,
  task: DevAgentTask,
): Promise<LangChainAgentResult> {
  switch (agentIdAtVersion) {
    case DEVELOPMENT_AGENT_IDS.architect:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, task, ArchitectOutputSchema, task);
    case DEVELOPMENT_AGENT_IDS.testDesigner:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, task, TestDesignerOutputSchema, task);
    case DEVELOPMENT_AGENT_IDS.planner:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, task, PlannerOutputSchema, task);
    case DEVELOPMENT_AGENT_IDS.coding:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, task, CodingOutputSchema, task);
    case DEVELOPMENT_AGENT_IDS.review:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, task, ReviewOutputSchema, task);
    case DEVELOPMENT_AGENT_IDS.qa:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, task, QaOutputSchema, task);
    case DEVELOPMENT_AGENT_IDS.devopsDelivery:
      return invokeStructuredAgent(runCtx, agentIdAtVersion, task, DevopsDeliveryOutputSchema, task);
    default:
      throw new Error(`Unknown development agent: ${agentIdAtVersion}`);
  }
}
