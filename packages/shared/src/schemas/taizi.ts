import { z } from "zod";

/**
 * Taizi（太子）调度 Agent —— 用户自由输入的统一入口。
 *
 * 用户在任意阶段输入的自由文本先交给 Taizi 分类，Taizi 产出一个
 * TaiziDecision，由 API 层 dispatcher 把它落到具体的 service 调用
 * （恢复工作流 / 回答问题 / 插话 / 变更请求 / 门禁决策 / 导出 …）。
 */
export const TaiziIntentSchema = z.enum([
  /** 「继续 / 接着做 / go on」—— 推进当前停住的工作流 */
  "continue",
  /** 「暂停 / 先停一下」—— 暂停项目（保留状态，可恢复） */
  "pause",
  /** 「停 / 别做了 / 打断」—— 打断当前正在执行的操作 */
  "stop",
  /** 全新需求描述（仅 Draft Requirement 阶段有效） */
  "new_requirement",
  /** 对当前澄清问题的回答 */
  "answer_question",
  /** 「跳过问题 / 用默认的就行」 */
  "skip_clarification",
  /** 对打开的门禁做决策（approve / reject / …） */
  "gate_decision",
  /** 「加一个 xxx 功能 / 改成 yyy」—— 变更请求或开发中插话 */
  "change_request",
  /** 「开始开发 / 启动」 */
  "start_development",
  /** 「跑测试 / 开始测试」 */
  "start_testing",
  /** 「导出 / 打包提交」 */
  "export_submission",
  /** 「现在到哪了 / 进度如何」—— 状态询问，只读 */
  "status_query",
  /** 闲聊或无法归类 —— 直接回复，不触发任何动作 */
  "chat",
]);

export type TaiziIntent = z.infer<typeof TaiziIntentSchema>;

/** Taizi 分类时能看到的项目上下文快照（dispatcher 注入，不是用户输入）。 */
export const TaiziContextSchema = z.object({
  projectStatus: z.string(),
  /** 打开中的门禁：类型 + 允许的选项 */
  openGates: z.array(
    z.object({
      id: z.string(),
      gateType: z.string(),
      options: z.array(z.string()),
    }),
  ),
  /** 待回答的澄清问题数（question round 进行中时 > 0） */
  pendingQuestionCount: z.number().int().min(0),
  /** 是否有活跃的编码会话（可被插话/打断） */
  hasLiveSession: z.boolean(),
  /** 开发切片循环是否在本进程内运行（含平台测试/审查等无 opencode 会话的间隙） */
  devLoopActive: z.boolean().optional(),
});

export type TaiziContext = z.infer<typeof TaiziContextSchema>;

/** One turn in Taizi ↔ user chat history (for multi-turn LLM context). */
export const TaiziChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type TaiziChatTurn = z.infer<typeof TaiziChatTurnSchema>;

/** Default number of prior user↔Taizi exchanges to inject into LLM context. */
export const DEFAULT_TAIZI_HISTORY_TURNS = 10;

/** Max characters per history turn before truncation. */
export const MAX_TAIZI_TURN_CHARS = 2_000;

/** Taizi 的结构化输出：意图 + 给用户的回复 + 动作参数。 */
export const TaiziDecisionSchema = z.object({
  intent: TaiziIntentSchema,
  /** 0-1；规则命中为 1，LLM 分类为模型自评 */
  confidence: z.number().min(0).max(1),
  /** 必填：用一句简体中文告诉用户 Taizi 理解了什么、将要做什么 */
  reply: z.string(),
  /** intent=gate_decision 时：选用的门禁选项（必须在 options 内） */
  gateDecision: z.string().optional(),
  /** intent=gate_decision 时：目标门禁 id（缺省取第一个 open 门禁） */
  gateId: z.string().optional(),
  /** 规范化后的正文（变更请求摘要 / 需求文本 / 问题答案等） */
  payload: z.string().optional(),
  /** intent=stop / change_request 时：是否需要硬打断当前生成 */
  abort: z.boolean().optional(),
});

export type TaiziDecision = z.infer<typeof TaiziDecisionSchema>;

/** dispatcher 执行后的动作结果，回给客户端 & 写进事件流。 */
export const TaiziDispatchResultSchema = z.object({
  intent: TaiziIntentSchema,
  /** 实际执行的动作（如 "development.start", "gate.approve", "noop"） */
  action: z.string(),
  /** 给用户的最终反馈（含执行结果） */
  reply: z.string(),
  /** 动作是否真正改变了系统状态 */
  stateChanged: z.boolean(),
  /** 客户端应自动打开的本机路径（如导出提交包目录） */
  openPath: z.string().optional(),
});

export type TaiziDispatchResult = z.infer<typeof TaiziDispatchResultSchema>;
