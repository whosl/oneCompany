/** Fixed business catalogs: agents, lifecycle, gates (mirrors @oc/shared + agent-core). */

export type AgentGroup = "requirement" | "development";

export type AgentCatalogEntry = {
  id: string;
  name: string;
  role: string;
  description: string;
  group: AgentGroup;
  /** Skills / tools / engine capabilities, shown in the agent detail card. */
  capabilities: string[];
};

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    id: "intake",
    name: "Intake",
    role: "需求录入 / 规范化",
    description: "把用户的原始输入整理成规范、可用的需求概述。",
    group: "requirement",
    capabilities: ["LLM 结构化输出", "需求规范化"],
  },
  {
    id: "requirement-analyst",
    name: "Requirement Analyst",
    role: "需求解析 / 结构化",
    description: "提取结构化需求：用户、数据对象、流程与约束。",
    group: "requirement",
    capabilities: ["LLM 结构化输出", "工具: requirement-context（读历史需求上下文）"],
  },
  {
    id: "completeness-scorer",
    name: "Completeness Scorer",
    role: "完整度评分",
    description: "评估需求完整度，决定是否继续提问。",
    group: "requirement",
    capabilities: ["LLM 结构化输出", "完整度阈值判定"],
  },
  {
    id: "question-planner",
    name: "Question Planner",
    role: "澄清问题规划",
    description: "规划聚焦业务的澄清问题，技术细节按最佳实践自行推荐。",
    group: "requirement",
    capabilities: ["LLM 结构化输出", "业务导向提问策略"],
  },
  {
    id: "prd-acceptance",
    name: "PRD & Acceptance",
    role: "PRD / 验收标准",
    description: "基于确认的需求产出 PRD 与验收标准。",
    group: "requirement",
    capabilities: ["LLM 结构化输出", "产物: PRD / 验收标准（版本化）"],
  },
  {
    id: "architect",
    name: "Architect",
    role: "技术方案 / 架构",
    description: "产出技术方案，供技术方案 gate 审核。",
    group: "development",
    capabilities: ["LLM 结构化输出", "工具: read-artifact / workspace-read", "产物: 技术方案"],
  },
  {
    id: "planner",
    name: "Planner",
    role: "切片规划 / 测试设计",
    description: "把验收标准拆分为有序的功能切片，并为每个切片设计 vitest 测试（tests/ 路径）。",
    group: "development",
    capabilities: ["LLM 结构化输出", "切片拆分与排序", "vitest 测试设计"],
  },
  {
    id: "coding",
    name: "Coding",
    role: "代码生成 / 文件编辑",
    description: "逐个实现功能切片（底层使用 OpenCode Harness 执行引擎）。",
    group: "development",
    capabilities: [
      "底层引擎: OpenCode Harness",
      "工具: bash / read / write / edit / grep / glob / todo",
      "受治理 shell（高危命令走 gate + 沙箱）",
      "TDD 切片实现",
    ],
  },
  {
    id: "review",
    name: "Review",
    role: "代码审查",
    description: "切片提交后进行真实代码审查（底层使用 OpenCode Harness，只读模式）。",
    group: "development",
    capabilities: [
      "底层引擎: OpenCode Harness（只读）",
      "工具: read / grep / glob",
      "结构化审查结论（通过 / 不通过 + 发现）",
    ],
  },
  {
    id: "qa",
    name: "QA",
    role: "运行验证",
    description: "验证预览质量，执行集成验证。",
    group: "development",
    capabilities: ["LLM 结构化输出", "集成验证 / 预览检查"],
  },
  {
    id: "devops-delivery",
    name: "DevOps Delivery",
    role: "交付 / 导出",
    description: "汇总交付产物并生成最终报告。",
    group: "development",
    capabilities: ["LLM 结构化输出", "产物: 交付报告"],
  },
  {
    id: "taizi",
    name: "太子",
    role: "调度 / 问答",
    description: "接收自由输入，路由工作流动作；信息类问题调用只读工具调研后作答。",
    group: "requirement",
    capabilities: ["意图分类", "只读工具调研", "工作流调度"],
  },
];

export const GROUP_LABEL: Record<AgentGroup, string> = {
  requirement: "Requirement",
  development: "Development",
};

export function normalizeAgentId(agentId?: string): string | undefined {
  if (!agentId) return undefined;
  const key = agentId.split("@")[0]?.split(":")[0] ?? agentId;
  // The opencode engine is an implementation detail; historic events emitted
  // under "opencode" belong to the Coding role in the UI.
  return key === "opencode" ? "coding" : key;
}

export function findAgent(agentId?: string): AgentCatalogEntry | undefined {
  const key = normalizeAgentId(agentId);
  return key ? AGENT_CATALOG.find((a) => a.id === key) : undefined;
}

export function agentDisplayName(agentId?: string): string {
  const entry = findAgent(agentId);
  if (entry) return entry.name;
  const key = normalizeAgentId(agentId);
  return key ? key.replace(/-/g, " ") : "Agent";
}

/** Collapsed activity-group header icon per agent role. */
export const AGENT_COLLAPSED_ICONS: Record<string, string> = {
  intake: "◌",
  "requirement-analyst": "◇",
  "completeness-scorer": "◎",
  "question-planner": "?",
  "prd-acceptance": "✓",
  architect: "◆",
  planner: "▣",
  coding: "⚙",
  review: "⧉",
  qa: "▤",
  "devops-delivery": "↗",
  taizi: "◆",
};

export function agentCollapsedIcon(agentId?: string): string | undefined {
  const key = normalizeAgentId(agentId);
  return key ? AGENT_COLLAPSED_ICONS[key] : undefined;
}

export function agentCollapsedIconByName(name: string): string | undefined {
  const entry = AGENT_CATALOG.find((agent) => agent.name === name);
  return entry ? AGENT_COLLAPSED_ICONS[entry.id] : undefined;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                            */
/* ------------------------------------------------------------------ */

export type LifecycleStep = {
  id: string;
  label: string;
  statuses: string[];
};

export const LIFECYCLE_STEPS: LifecycleStep[] = [
  { id: "requirement", label: "Require", statuses: ["Draft Requirement", "Asking Questions"] },
  { id: "prd", label: "PRD", statuses: ["PRD Ready"] },
  { id: "tech-plan", label: "Plan", statuses: ["Tech Plan Review"] },
  { id: "development", label: "Develop", statuses: ["Developing", "Change Review"] },
  { id: "testing", label: "Test", statuses: ["Testing"] },
  { id: "deploy", label: "Deploy", statuses: ["Deploying"] },
  { id: "delivery", label: "Deliver", statuses: ["Awaiting Acceptance", "Delivered"] },
];

export function lifecycleIndex(status: string): number {
  const index = LIFECYCLE_STEPS.findIndex((step) => step.statuses.includes(status));
  return index >= 0 ? index : -1;
}

/* ------------------------------------------------------------------ */
/* Gates                                                                */
/* ------------------------------------------------------------------ */

export type GateDefinition = {
  title: string;
  description: string;
  options: string[];
};

export const GATE_DEFINITIONS: Record<string, GateDefinition> = {
  requirement_confirm: {
    title: "确认需求",
    description: "PRD 与验收标准已生成，请 review 后决定是否进入开发。",
    options: ["approve", "revise_then_approve", "reject_and_redo", "custom"],
  },
  tech_plan_confirm: {
    title: "确认技术方案",
    description: "架构师已产出技术方案，请 review 后决定是否开始实现。",
    options: ["approve", "revise_then_approve", "reject_and_redo", "custom"],
  },
  requirement_stuck: {
    title: "需求完成度不达标",
    description: "多轮问答后需求完成度仍未达到阈值，需要你决定如何继续。",
    options: ["keep_answering", "force_continue", "fail"],
  },
  slice_failure: {
    title: "切片开发失败",
    description: "某个功能切片在重试预算内未能完成，需要你决定如何处理。",
    options: ["retry", "replan", "replan_slices", "request_skip_slice", "fail"],
  },
  change_review: {
    title: "变更评审",
    description: "收到变更请求，请决定如何调整当前计划。",
    options: ["update_plan", "revise_tech_plan", "reject"],
  },
  deployment: {
    title: "部署确认",
    description: "确认对外暴露的部署 URL（测试阶段已生成 Preview，可直接批准）。",
    options: ["approve", "reject", "custom"],
  },
  dangerous_operation: {
    title: "危险操作确认",
    description: "Agent 即将执行高风险操作，请确认是否放行。",
    options: ["approve", "skip_risk_and_continue", "reject", "custom"],
  },
  final_acceptance: {
    title: "最终验收",
    description: "项目已交付，请验收通过或驳回重做（需说明问题）。",
    options: ["accept", "reject_and_redo"],
  },
  coding_question: {
    title: "Coding Agent 提问",
    description: "编码 Agent 在实现切片时遇到歧义，需要你澄清才能继续。",
    options: ["answer", "skip"],
  },
};

/** Human-readable Chinese labels for gate option keys. */
export const GATE_OPTION_LABELS: Record<string, string> = {
  approve: "通过",
  revise_then_approve: "提出修改意见后通过",
  reject_and_redo: "驳回重做",
  custom: "自定义答复",
  keep_answering: "继续提问澄清（追加轮次）",
  force_continue: "强行继续生成 PRD（接受风险）",
  fail: "终止",
  retry: "重试该切片",
  replan: "重新规划技术方案",
  replan_slices: "重新规划切片",
  request_skip_slice: "跳过该切片",
  update_plan: "更新开发计划",
  revise_tech_plan: "修改技术方案",
  reject: "拒绝",
  skip_risk_and_continue: "跳过风险并继续",
  accept: "验收通过",
  answer: "输入答案继续",
  skip: "跳过，让 agent 自行假设",
};

/* ------------------------------------------------------------------ */
/* Tool call presentation                                               */
/* ------------------------------------------------------------------ */

const TOOL_VERBS: Record<string, string> = {
  bash: "运行命令",
  shell: "运行命令",
  write: "写入文件",
  edit: "编辑文件",
  multiedit: "编辑文件",
  patch: "编辑文件",
  read: "读取文件",
  glob: "搜索文件",
  grep: "搜索代码",
  list: "浏览目录",
  todowrite: "更新任务清单",
  todoread: "查看任务清单",
  webfetch: "抓取网页",
  task: "派发子任务",
};

const WRITE_TOOL_NAMES = new Set(["write", "edit", "multiedit", "patch"]);

export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOL_NAMES.has(toolName.toLowerCase());
}

/** In-progress suffix for tool rows in the activity stream. */
export function toolInProgressSuffix(toolName?: string): string {
  return isWriteTool(toolName ?? "") ? "写入中…" : "…";
}

/** Human-readable Chinese verb for a tool call ("运行命令" / "写入文件" …). */
export function toolVerb(toolName: string): string {
  const key = toolName.toLowerCase();
  if (TOOL_VERBS[key]) return TOOL_VERBS[key];
  if (key.startsWith("oc_") || key.includes(":")) return `调用集成 ${toolName}`;
  if (key.includes("requirement-context")) return "读取需求上下文";
  if (key.includes("read-artifact")) return "读取产物";
  if (key.includes("workspace-read")) return "读取工作区";
  return toolName;
}

export function gateDefinition(gateType: string): GateDefinition {
  return (
    GATE_DEFINITIONS[gateType] ?? {
      title: gateType,
      description: "请处理该确认项以继续。",
      options: ["approve", "reject"],
    }
  );
}
