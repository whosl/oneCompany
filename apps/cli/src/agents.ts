export type AgentGroup = "requirement" | "development";

export type AgentCatalogEntry = {
  id: string;
  name: string;
  role: string;
  group: AgentGroup;
};

/** Real OneCompany agents — requirement group + development group. */
export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    id: "intake",
    name: "Intake",
    role: "需求录入 / 规范化",
    group: "requirement",
  },
  {
    id: "requirement-analyst",
    name: "Requirement Analyst",
    role: "需求解析 / 结构化",
    group: "requirement",
  },
  {
    id: "completeness-scorer",
    name: "Completeness Scorer",
    role: "完整度评分",
    group: "requirement",
  },
  {
    id: "question-planner",
    name: "Question Planner",
    role: "澄清问题规划",
    group: "requirement",
  },
  {
    id: "prd-acceptance",
    name: "PRD & Acceptance",
    role: "PRD / 验收标准",
    group: "requirement",
  },
  {
    id: "architect",
    name: "Architect",
    role: "技术方案 / 架构",
    group: "development",
  },
  {
    id: "test-designer",
    name: "Test Designer",
    role: "测试设计",
    group: "development",
  },
  {
    id: "planner",
    name: "Planner",
    role: "切片规划",
    group: "development",
  },
  {
    id: "coding",
    name: "Coding",
    role: "代码生成 / 文件编辑",
    group: "development",
  },
  {
    id: "review",
    name: "Review",
    role: "代码审查",
    group: "development",
  },
  {
    id: "qa",
    name: "QA",
    role: "运行验证",
    group: "development",
  },
  {
    id: "devops-delivery",
    name: "DevOps Delivery",
    role: "交付 / 导出",
    group: "development",
  },
];

const GROUP_LABEL: Record<AgentGroup, string> = {
  requirement: "Requirement Group",
  development: "Development Group",
};

export function normalizeAgentId(agentId?: string): string | undefined {
  if (!agentId) return undefined;
  return agentId.split("@")[0]?.split(":")[0] ?? agentId;
}

export function resolveAgentDisplayName(agentId?: string): string {
  const key = normalizeAgentId(agentId);
  if (!key) return "Agent";
  const entry = AGENT_CATALOG.find((a) => a.id === key);
  return entry?.name ?? key.replace(/-/g, " ");
}

export function resolveAgentRole(agentId?: string): string {
  const key = normalizeAgentId(agentId);
  if (!key) return "—";
  const entry = AGENT_CATALOG.find((a) => a.id === key);
  return entry?.role ?? "—";
}

export function resolveAgentGroup(agentId?: string): AgentGroup | undefined {
  const key = normalizeAgentId(agentId);
  if (!key) return undefined;
  return AGENT_CATALOG.find((a) => a.id === key)?.group;
}

export function activeGroupFromLabel(label?: string): AgentGroup | undefined {
  if (!label) return undefined;
  if (label.toLowerCase().includes("requirement")) return "requirement";
  if (label.toLowerCase().includes("development")) return "development";
  return undefined;
}

export function groupLabel(group: AgentGroup): string {
  return GROUP_LABEL[group];
}
