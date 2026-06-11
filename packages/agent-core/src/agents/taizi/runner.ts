import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  TaiziDecisionSchema,
  type TaiziContext,
  type TaiziDecision,
} from "@oc/shared";
import { getOpenAiApiKey } from "../../engine-mode.js";
import { createChatModel } from "../../llm/langchain-model.js";

export type TaiziClassifyInput = {
  message: string;
  context: TaiziContext;
};

/* ------------------------------------------------------------------ */
/* 提示词（A2A 协议说明 + 意图分类规则）                                  */
/* ------------------------------------------------------------------ */

/**
 * Taizi 的 system prompt。设计要点：
 * 1. Taizi 不直接执行任何动作 —— 它只输出结构化的「路由决策」，
 *    由 dispatcher（API 层）调用目标 agent / workflow。这就是 A2A 边界：
 *    Taizi → (TaiziDecision) → dispatcher → 目标 agent，目标 agent 的产出
 *    通过事件流（taizi.routed → agent.* 事件）回流给用户。
 * 2. 提供完整的项目状态机视角，让模型基于「当前状态 + 用户话语」联合判断，
 *    而不是只看字面。
 * 3. 强约束：只能选给定 intent；gate_decision 必须从 options 里选；
 *    拿不准一律降级为 chat（只回复不动作），保证安全。
 */
export function buildTaiziSystemPrompt(context: TaiziContext): string {
  const gateLines =
    context.openGates.length > 0
      ? context.openGates
          .map((g) => `  - id=${g.id} type=${g.gateType} options=[${g.options.join(", ")}]`)
          .join("\n")
      : "  （无）";

  return [
    "你是 OneCompany 软件交付流水线的「太子（Taizi）调度 Agent」。",
    "用户的所有自由输入都先经过你。你的唯一职责：判断用户意图，输出一个 JSON 路由决策，由系统分发给对应的 agent 执行。你自己不执行任何动作。",
    "",
    "== 当前项目上下文 ==",
    `项目状态: ${context.projectStatus}`,
    `打开中的门禁:\n${gateLines}`,
    `待回答的澄清问题数: ${context.pendingQuestionCount}`,
    `是否有活跃编码会话（可插话/打断）: ${context.hasLiveSession ? "是" : "否"}`,
    "",
    "== 可选意图（intent）==",
    "- continue: 用户想推进当前停住的工作流（「继续」「接着做」「go」）。",
    "- pause: 用户想暂停整个项目（「先停一下」「暂停」）。",
    "- stop: 用户想打断当前正在执行的操作（「停」「别做了」「打断」）。",
    "- new_requirement: 一段全新的产品需求描述（仅在 Draft Requirement 状态下选择）。",
    "- answer_question: 内容是对当前澄清问题的回答（仅当待回答问题数 > 0）。",
    "- skip_clarification: 用户想跳过澄清直接生成 PRD（「跳过」「用默认的」）。",
    "- gate_decision: 用户对打开的门禁表态（「批准」「通过」「拒绝」「重做」…）。必须同时给出 gateDecision 字段，且取值必须在该门禁的 options 列表内；多个门禁时给出 gateId。",
    "- change_request: 用户想新增/修改功能（「加一个xxx」「把yyy改成zzz」）。payload 写规范化后的变更摘要。",
    "- start_development: 用户想启动开发（「开始开发」「启动」，状态为 PRD Ready 时）。",
    "- start_testing: 用户想运行测试（状态为 Testing 时）。",
    "- export_submission: 用户想导出提交包。",
    "- status_query: 用户在问进度/状态/失败原因，只需要回答，不需要动作（系统会用只读工具调研后作答）。",
    "- chat: 闲聊、项目咨询、或你拿不准的输入 —— 只读调研后回复，不触发工作流动作。",
    "",
    "== 结合状态判断的规则 ==",
    "1. 同样一句「继续」，含义随状态变化：Paused→恢复项目；有门禁→批准放行；Asking Questions→跳过澄清；PRD Ready→启动开发；Developing 静止→续跑切片。你只需输出 continue，系统会按状态落地——除非用户明确指名某个门禁选项，那时输出 gate_decision。",
    "2. 「加一个xxx功能」在 Developing/Testing 是 change_request；在 Draft Requirement 是 new_requirement 的一部分；在 Asking Questions 把它当作补充信息输出 answer_question 并在 payload 保留原文。",
    "3. 用户输入以「!」开头，或明确说「立刻/马上停下来改」，设置 abort=true。",
    "4. 有风险的决策（reject、fail、reject_and_redo）只有用户明确表达时才选，绝不因为语气含糊而猜测。",
    "5. 拿不准时一律 chat，并在 reply 里列出你猜测的 2-3 种可能让用户确认。",
    "",
    "== 输出格式 ==",
    "只输出一个 JSON 对象，不要有任何其他文字：",
    `{
  "intent": "continue | pause | stop | new_requirement | answer_question | skip_clarification | gate_decision | change_request | start_development | start_testing | export_submission | status_query | chat",
  "confidence": 0.0,
  "reply": "一句简体中文，告诉用户你理解了什么、系统将做什么",
  "gateDecision": "仅 gate_decision 时必填，必须取自该门禁的 options",
  "gateId": "多个门禁时指明目标门禁 id",
  "payload": "规范化正文（变更摘要/需求文本/问题答案），没有则省略",
  "abort": false
}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 规则快速通道（零成本、零延迟，覆盖最高频输入）                          */
/* ------------------------------------------------------------------ */

const CONTINUE_RE = /^(继续|接着(做|来)?|go( on)?|resume|run|推进|走你|开始吧)[。!！.\s]*$/i;
const PAUSE_RE = /^(暂停|先停一下|stop for now|pause|挂起)[。!！.\s]*$/i;
const STOP_RE = /^(停|停下|停止|别做了|打断|abort|cancel|halt)[。!！.\s]*$/i;
const SKIP_RE = /^(跳过(澄清|问题)?|skip|用默认(的|值)?(就行)?|不用问了)[。!！.\s]*$/i;
const EXPORT_RE = /^(导出|打包|export|提交包|导出提交包)[。!！.\s]*$/i;
const STATUS_RE =
  /^(进度|状态|到哪(一步)?了|现在(怎么样|什么情况|进行)|目前卡在哪(儿)?|目前(进行|到)|卡在哪(儿)?|什么情况|怎么样了|下一步(是啥|是什么|呢)?|咋办|怎么办|然后呢|多久了?|多长时间|开发多久|目前|你可以干嘛|你能干嘛)[?？。\s]*$/i;

/** 用户是在问进度/下一步，而不是在提功能变更。 */
export function isStatusInquiry(message: string): boolean {
  const text = message.trim();
  return STATUS_RE.test(text) || /^(什么|啥)情况/.test(text);
}
const APPROVE_RE = /^(批准|通过|同意|approve|确认|ok|好的?|可以|没问题|lgtm)[。!！.\s]*$/i;
const REJECT_RE = /^(拒绝|不行|reject|不同意|否决)[。!！.\s]*$/i;
const ADD_FEATURE_RE = /^!?\s*(加|增加|添加|新增|补充|改|修改|调整|换成|去掉|删除|移除)/;

/** 规则命中即返回；返回 undefined 表示交给 LLM。 */
export function classifyTaiziWithRules(
  message: string,
  context: TaiziContext,
): TaiziDecision | undefined {
  const text = message.trim();
  const firstGate = context.openGates[0];

  // 「!」前缀 = 硬打断：先中止当前生成，再传达新指示。
  if (text.startsWith("!") && text.length > 1 && context.hasLiveSession) {
    return {
      intent: "change_request",
      confidence: 1,
      reply: "立刻打断当前操作并传达新指示。",
      payload: text.slice(1).trim(),
      abort: true,
    };
  }

  if (isStatusInquiry(text)) {
    return { intent: "status_query", confidence: 1, reply: "" };
  }
  if (CONTINUE_RE.test(text)) {
    return {
      intent: "continue",
      confidence: 1,
      reply: "收到，按当前状态推进工作流。",
    };
  }
  if (PAUSE_RE.test(text)) {
    return { intent: "pause", confidence: 1, reply: "好的，暂停项目，随时可以恢复。" };
  }
  if (STOP_RE.test(text)) {
    return {
      intent: "stop",
      confidence: 1,
      reply: context.hasLiveSession ? "正在打断当前操作…" : "当前没有进行中的操作，将暂停项目。",
      abort: true,
    };
  }
  if (SKIP_RE.test(text) && context.pendingQuestionCount > 0) {
    return {
      intent: "skip_clarification",
      confidence: 1,
      reply: "跳过剩余澄清问题，采用系统默认假设生成 PRD。",
    };
  }
  if (EXPORT_RE.test(text)) {
    return { intent: "export_submission", confidence: 1, reply: "开始导出提交包…" };
  }
  if (firstGate && APPROVE_RE.test(text)) {
    const decision = firstGate.options.includes("approve")
      ? "approve"
      : firstGate.options.includes("accept")
        ? "accept"
        : undefined;
    if (decision) {
      return {
        intent: "gate_decision",
        confidence: 1,
        reply: `批准「${firstGate.gateType}」门禁，工作流继续。`,
        gateDecision: decision,
        gateId: firstGate.id,
      };
    }
  }
  if (firstGate && REJECT_RE.test(text)) {
    const decision = firstGate.options.includes("reject")
      ? "reject"
      : firstGate.options.includes("reject_and_redo")
        ? "reject_and_redo"
        : undefined;
    if (decision) {
      return {
        intent: "gate_decision",
        confidence: 1,
        reply: `已拒绝「${firstGate.gateType}」门禁。`,
        gateDecision: decision,
        gateId: firstGate.id,
      };
    }
  }
  // 「加一个xxx」式输入：开发期是变更请求；澄清期保留为补充答案；其余交给 LLM 细判。
  if (ADD_FEATURE_RE.test(text)) {
    const abort = text.startsWith("!");
    const payload = abort ? text.slice(1).trim() : text;
    if (context.projectStatus === "Developing" || context.projectStatus === "Testing") {
      return {
        intent: "change_request",
        confidence: 0.9,
        reply: abort ? "立刻打断当前操作并传达新需求。" : "把这条变更递给正在工作的 Agent。",
        payload,
        abort,
      };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* LLM 分类（规则未命中时）                                              */
/* ------------------------------------------------------------------ */

export async function classifyTaiziWithLlm(input: TaiziClassifyInput): Promise<TaiziDecision> {
  const model = createChatModel("cheap");
  const structured = model.withStructuredOutput(TaiziDecisionSchema, { method: "jsonMode" });
  const raw = await structured.invoke([
    new SystemMessage(buildTaiziSystemPrompt(input.context)),
    new HumanMessage(input.message),
  ]);
  return TaiziDecisionSchema.parse(raw);
}

/** 状态相关的保底分类：无 LLM（stub 模式 / 未配 key）时的兜底。 */
function fallbackDecision(input: TaiziClassifyInput): TaiziDecision {
  const { message, context } = input;
  // 澄清期的自由文本最可能是答案的补充。
  if (context.pendingQuestionCount > 0) {
    return {
      intent: "answer_question",
      confidence: 0.5,
      reply: "已把这条信息计入当前问题的回答。",
      payload: message,
    };
  }
  // 开发/测试期的自由文本按插话处理（「!」前缀 = 硬打断）。
  if (context.projectStatus === "Developing" || context.projectStatus === "Testing") {
    const abort = message.startsWith("!");
    return {
      intent: "change_request",
      confidence: 0.5,
      reply: abort ? "立刻打断当前操作并传达新指示。" : "把这条信息递给正在工作的 Agent。",
      payload: abort ? message.slice(1).trim() : message,
      abort,
    };
  }
  if (context.projectStatus === "Draft Requirement") {
    return {
      intent: "new_requirement",
      confidence: 0.6,
      reply: "把这段文字作为产品需求启动流水线。",
      payload: message,
    };
  }
  return {
    intent: "chat",
    confidence: 0.3,
    reply: "我不确定你想做什么。你可以说「继续」「暂停」「加一个xxx功能」或「导出提交包」。",
  };
}

/**
 * Taizi 分类主入口：规则 → LLM → 状态保底。
 * LLM 不可用（未配 key）或调用失败时降级为保底分类，不阻塞用户。
 */
export async function classifyTaiziMessage(input: TaiziClassifyInput): Promise<TaiziDecision> {
  const ruled = classifyTaiziWithRules(input.message, input.context);
  if (ruled) return ruled;

  if (getOpenAiApiKey()) {
    try {
      return await classifyTaiziWithLlm(input);
    } catch {
      // LLM 故障不阻塞调度，落到状态保底。
    }
  }
  return fallbackDecision(input);
}
