import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { TaiziChatTurn, TaiziContext } from "@oc/shared";
import { getOpenAiApiKey } from "../../engine-mode.js";
import { createChatModel } from "../../llm/langchain-model.js";
import { bindAgentTools } from "../../tools/bind-tools.js";
import type { ToolExecutionContext } from "../../tools/registry.js";
import { TAIZI_AGENT_DEFINITION } from "./definitions.js";
import { ensureTaiziToolsRegistered } from "./local-tools.js";
import { buildTaiziChatMessages } from "./messages.js";
import { runTaiziToolLoop } from "./tool-loop.js";

export type TaiziAnswerInput = {
  message: string;
  context: TaiziContext;
  /** Prior user↔Taizi turns from persisted events (oldest first). */
  history?: TaiziChatTurn[];
  execCtx: ToolExecutionContext;
  /** Static fallback when LLM/tools unavailable (e.g. summarizeStatus output). */
  fallbackReply?: string;
};

export function buildTaiziAnswerPrompt(context: TaiziContext): string {
  const gateLines =
    context.openGates.length > 0
      ? context.openGates
          .map((g) => `  - ${g.gateType} (options: ${g.options.join(", ")})`)
          .join("\n")
      : "  （无）";

  return [
    "你是 OneCompany 的「太子（Taizi）」—— 用户的信息助手与调度入口。",
    "当前任务：回答用户关于本项目的问题。你可以自由调用只读工具查阅数据库、事件流、开发/需求会话、产物与代码仓库文件。",
    "禁止：修改代码、执行 shell、触发工作流动作、代替用户做门禁决策。",
    "",
    "== 已知上下文 ==",
    `项目状态: ${context.projectStatus}`,
    `打开中的门禁:\n${gateLines}`,
    `待回答澄清问题: ${context.pendingQuestionCount}`,
    `活跃编码会话: ${context.hasLiveSession ? "是" : "否"}`,
    `开发循环运行中: ${context.devLoopActive ? "是（平台正在执行测试/审查等步骤，Agent 并非空闲）" : "否"}`,
    "",
    "== 作答要求 ==",
    "1. 先按需调用工具收集事实，再作答；不要编造未查证的数据。",
    "2. 用简体中文，结构清晰；说明「现状 → 原因（如有）→ 建议下一步」。",
    "3. 若用户问进度/卡在哪，优先查 dev-session、recent-events、gates。",
    "4. 若用户问测试/切片失败，查 recent-events 中 test.result 与 dev-session.testResults。",
    "5. 信息不足时如实说明，并告诉用户可以说什么来推进（继续/批准/拒绝等）。",
    "6. 用 Markdown 组织回答，**必须**包含 `## 现状`、`## 建议下一步` 两节；有失败/门禁时加 `## 原因`。",
    "7. 先写主体结论（状态、切片、门禁、测试结果等具体事实），最后最多一句简短补充；禁止只写「如需了解更多可以问我」而无正文。",
    "8. 不要描述你调用了哪些工具。",
  ].join("\n");
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: string }).text);
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function findLastAssistantAnswer(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!(msg instanceof AIMessage)) continue;
    if (msg.tool_calls?.length) continue;
    const text = extractTextContent(msg.content);
    if (text) return text;
  }
  return "";
}

function hasToolResults(messages: BaseMessage[]): boolean {
  return messages.some((msg) => msg instanceof ToolMessage);
}

/** Closing invitation without structured body — common after multi-tool rounds. */
export function isWeakTaiziAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length > 360) return false;
  const hasStructure = /^##\s/m.test(trimmed) || /^[-*]\s/m.test(trimmed) || /^\d+\.\s/m.test(trimmed);
  const closingOnly =
    /(如需|如果想|随时|还可以|告诉我|可以问我|更具体)/.test(trimmed) &&
    !/(项目状态|当前|切片|门禁|Change Review|Developing|Testing|slice|gate)/i.test(trimmed);
  return !hasStructure && (closingOnly || trimmed.length < 80);
}

/**
 * 用只读工具调研项目后生成自然语言回答。
 * LLM 不可用或失败时返回 fallbackReply。
 */
export async function answerTaiziWithTools(input: TaiziAnswerInput): Promise<string> {
  const { message, context, history = [], execCtx, fallbackReply } = input;
  if (!getOpenAiApiKey()) {
    return fallbackReply ?? "当前未配置 LLM，无法调研项目详情。";
  }

  ensureTaiziToolsRegistered();

  try {
    const model = createChatModel("cheap");
    const tools = bindAgentTools(TAIZI_AGENT_DEFINITION, execCtx);
    const messages = buildTaiziChatMessages(buildTaiziAnswerPrompt(context), history, message);
    const afterTools = await runTaiziToolLoop(model, messages, tools);

    let text = "";
    if (hasToolResults(afterTools)) {
      const synthesis = await model.invoke([
        ...afterTools,
        new HumanMessage(
          [
            "请根据以上工具返回的数据，完整回答用户的原始问题。",
            "必须包含 Markdown：`## 现状`（项目状态、切片、门禁、测试等具体事实）、`## 建议下一步`。",
            "如有失败或卡点，加 `## 原因`。",
            "禁止只写结尾邀请语而不给主体内容。",
          ].join("\n"),
        ),
      ]);
      text = extractTextContent(synthesis.content);
    }

    if (!text) {
      text = findLastAssistantAnswer(afterTools);
    }
    if (!text) {
      const final = await model.invoke(afterTools);
      text = extractTextContent(final.content);
    }

    if (text && isWeakTaiziAnswer(text) && fallbackReply) {
      return `## 现状\n\n${fallbackReply}\n\n## 补充\n\n${text}`.trim();
    }
    if (text) {
      return text;
    }
  } catch {
    /* fall through */
  }

  return fallbackReply ?? "暂时无法调研项目详情，请稍后重试。";
}

/** status_query / chat 等纯信息类意图应走工具调研。 */
export function shouldAnswerWithTools(intent: string): boolean {
  return intent === "status_query" || intent === "chat";
}
