import {
  AnalystOutputSchema,
  ArchitectOutputSchema,
  CodingOutputSchema,
  DevopsDeliveryOutputSchema,
  emit,
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

/** Per-agent working instructions (Chinese), appended to the system prompt. */
const AGENT_GUIDANCE: Record<string, string> = {
  [REQUIREMENT_AGENT_IDS.intake]:
    "你的任务：把用户的原始输入整理成一段简洁、规范的需求概述，识别目标用户、用户目标和应用类型，并列出仍需澄清的疑点。",
  [REQUIREMENT_AGENT_IDS.analyst]:
    "你的任务：从需求中提取结构化信息——核心功能、页面与流程、数据对象、角色与权限、外部集成、非功能需求；信息不足处给出合理假设并明确标注。",
  [REQUIREMENT_AGENT_IDS.scorer]:
    "你的任务：评估需求完整度（0-100）并列出缺口。注意：技术实现细节（技术栈、框架、协议、库等）不算缺口，可由团队按最佳实践决定；只有影响业务理解、功能范围和验收标准的缺失才算缺口。",
  [REQUIREMENT_AGENT_IDS.questionPlanner]: [
    "你的任务：规划向用户提出的澄清问题。要求：",
    "1. 只问业务层面的问题：目标用户与使用场景、核心业务流程、角色与权限、关键数据与状态流转、边界情况、验收期望、范围与优先级取舍。",
    "2. 不要向用户提技术实现问题（技术栈、框架、协议、第三方库、部署方式等）——这些由团队按行业最佳实践自行决定；如确有技术取舍影响业务，直接在建议答案中给出推荐默认值。",
    "3. 每个问题提供 2-4 个具体、可直接选用的建议答案。",
    "4. 问题要少而精，每轮不超过 3 个；使用通俗的业务语言，避免技术术语。",
  ].join("\n"),
  [REQUIREMENT_AGENT_IDS.prdAcceptance]:
    "你的任务：基于已确认的需求撰写 PRD 与验收标准，明确假设与风险；验收标准要可逐条验证。",
  [DEVELOPMENT_AGENT_IDS.architect]:
    "你的任务：产出技术方案——技术栈选型、架构说明与风险；方案需可被后续功能切片直接执行。",
  [DEVELOPMENT_AGENT_IDS.testDesigner]: "你的任务：为每个功能切片设计可执行、范围清晰的测试。",
  [DEVELOPMENT_AGENT_IDS.planner]: [
    "你的任务：把验收标准拆分为有序的功能切片，每个切片可独立实现、独立验证。",
    "切片粒度要求（每个切片都有固定开销：编码会话冷启动 + 测试 + 审查，约 5-8 分钟）：",
    "1. 优先合并：会改动同一批文件、或彼此强依赖的验收点必须合并为一个切片。",
    "2. 小型项目（单页应用、小游戏、工具类）控制在 2-3 个切片；中型项目不超过 5 个。",
    "3. 每个切片应是一个对用户有意义的功能增量，而不是一个文件或一个函数。",
    "4. 只有当两个验收点可以完全独立交付和验证时才拆开。",
  ].join("\n"),
  [DEVELOPMENT_AGENT_IDS.coding]:
    "你的任务：实现指定的功能切片，做最小必要修改，保证对应测试通过。",
  [DEVELOPMENT_AGENT_IDS.review]:
    "你的任务：审查切片改动——正确性、与验收标准的一致性、明显缺陷与风险。",
  [DEVELOPMENT_AGENT_IDS.qa]:
    "你的任务：验证预览质量；可调用受管控的集成工具，结论需引用工具结果。",
  [DEVELOPMENT_AGENT_IDS.devopsDelivery]: "你的任务：汇总交付产物并撰写交付说明。",
};

function systemPrompt(
  agentIdAtVersion: string,
  role: string,
  description: string,
  outputHint: string,
): string {
  return [
    `你是 OneCompany 软件交付流水线中的「${role}」。`,
    description,
    AGENT_GUIDANCE[agentIdAtVersion] ?? "",
    "所有面向用户的文本（plan、observation、reflection、问题、总结等）一律使用简体中文。",
    "在给出最终答案之前，可以调用已注册的工具。",
    "最终回答必须且只能是一个 JSON 对象。",
    "除任务输出字段外，同一 JSON 对象中还需包含 plan、observation、reflection 三个字符串字段。",
    outputHint,
  ]
    .filter(Boolean)
    .join("\n");
}

const PROGRESS_EMIT_INTERVAL_MS = 2_500;

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

  const baseMessages = [
    new SystemMessage(
      systemPrompt(
        agentIdAtVersion,
        agent.role,
        agent.description,
        outputSchemaHint(agentIdAtVersion),
      ),
    ),
    new HumanMessage(JSON.stringify(userPayload)),
  ];

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
