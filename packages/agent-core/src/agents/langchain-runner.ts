import {
  AnalystOutputSchema,
  ArchitectOutputSchema,
  CodingOutputSchema,
  DevopsDeliveryOutputSchema,
  emit,
  ephemeralEnvelope,
  IntakeOutputSchema,
  PlannerOutputSchema,
  PrdAcceptanceOutputSchema,
  QaOutputSchema,
  QuestionPlannerOutputSchema,
  ReviewOutputSchema,
  ScorerOutputSchema,
} from "@oc/shared";
import { buildStructuredAgentPrompts } from "./prompt-builder.js";
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
import { runOptionalToolLoop } from "./tool-loop.js";

export type LangChainAgentResult = {
  output: unknown;
  reasoning: AgentReasoningFields;
  modelId: string;
};

const PROGRESS_EMIT_INTERVAL_MS = 2_500;
const STREAM_DELTA_INTERVAL_MS = 250;
const STREAM_DELTA_MAX_TEXT = 1_500;

/**
 * Throttled streaming-progress callback: forwards "the model is producing
 * output right now" into the event stream so the console never shows a dead
 * silence during a long structured-output call.
 */
function createProgressCallback(runCtx: AgentRunContext, agentIdAtVersion: string) {
  let buffer = "";
  // Start the throttle window at creation: the very first token would
  // otherwise emit a useless "1 char" event.
  let lastEmitAt = Date.now();
  // Bypass token stream: broadcast-only envelopes, no DB write — safe to send
  // far more often than the persisted progress summaries.
  let lastStreamAt = 0;
  const streamId = `${agentIdAtVersion}-${Date.now()}`;

  const flushStream = (): void => {
    const now = Date.now();
    if (now - lastStreamAt < STREAM_DELTA_INTERVAL_MS || buffer.length === 0) {
      return;
    }
    lastStreamAt = now;
    try {
      runCtx.onEvent?.(
        ephemeralEnvelope({
          projectId: runCtx.projectId,
          agentId: agentIdAtVersion,
          payload: {
            type: "agent.stream_delta",
            projectId: runCtx.projectId,
            agentId: agentIdAtVersion,
            streamId,
            text: buffer.slice(-STREAM_DELTA_MAX_TEXT),
            charCount: buffer.length,
          },
        }),
      );
    } catch {
      // Streaming is best-effort; never fail the agent run over it.
    }
  };

  const flush = (): void => {
    const now = Date.now();
    if (now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS || buffer.length === 0) {
      return;
    }
    lastEmitAt = now;

    // Last JSON string value that contains actual prose (CJK) — JSON keys like
    // "architectureNotes" are ASCII-only and make useless snippets.
    const strings = buffer.match(/"((?:[^"\\]|\\.){8,})"/g);
    const tail = strings
      ?.filter((s) => /[\u4e00-\u9fff]/.test(s))
      .at(-1)
      ?.slice(1, -1)
      .replace(/\\n/g, " ")
      .slice(-80);
    const summary = tail
      ? `正在撰写：…${tail}（已生成 ${buffer.length} 字）`
      : `模型输出中（已生成 ${buffer.length} 字符）`;

    try {
      const envelope = emit(runCtx.db, {
        projectId: runCtx.projectId,
        agentId: agentIdAtVersion,
        payload: {
          type: "agent.progress",
          projectId: runCtx.projectId,
          agentId: agentIdAtVersion,
          summary,
          charCount: buffer.length,
        },
      });
      runCtx.onEvent?.(envelope);
    } catch {
      // Progress is best-effort; never fail the agent run over it.
    }
  };

  return {
    handleLLMNewToken(token: string): void {
      buffer += token;
      flushStream();
      flush();
    },
  };
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

  const { system, human } = buildStructuredAgentPrompts(runCtx.db, agentIdAtVersion, userPayload);
  try {
    const promptEnvelope = emit(runCtx.db, {
      projectId: runCtx.projectId,
      agentId: agent.id,
      payload: {
        type: "agent.prompt",
        projectId: runCtx.projectId,
        agentId: agent.id,
        system,
        human,
      },
    });
    runCtx.onEvent?.(promptEnvelope);
  } catch {
    // Prompt capture is best-effort; never fail the agent run over it.
  }

  const baseMessages = [new SystemMessage(system), new HumanMessage(human)];

  const tools = bindAgentTools(agent, {
    db: runCtx.db,
    projectId: runCtx.projectId,
    onEvent: runCtx.onEvent,
    authorize: runCtx.authorize,
    repoPath: runCtx.repoPath,
    callIntegration: runCtx.callIntegration,
    enabledIntegrationIds: runCtx.enabledIntegrationIds,
    task,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const messages =
        attempt === 0 && tools.length > 0
          ? await runOptionalToolLoop(model, baseMessages, tools)
          : baseMessages;
      const raw = await structured.invoke(messages, {
        callbacks: [createProgressCallback(runCtx, agentIdAtVersion)],
      });
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
