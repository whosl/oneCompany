import type { AgentRunStatus } from "../ui-v2/types";

export type LifecycleStepId =
  | "requirement"
  | "prd"
  | "tech-plan"
  | "development"
  | "testing"
  | "deploy"
  | "delivery";

export type LifecycleStep = {
  id: LifecycleStepId;
  label: string;
  statuses: string[];
};

export const LIFECYCLE_STEPS: LifecycleStep[] = [
  { id: "requirement", label: "需求澄清", statuses: ["Draft Requirement", "Asking Questions"] },
  { id: "prd", label: "PRD 确认", statuses: ["PRD Ready"] },
  { id: "tech-plan", label: "技术方案", statuses: ["Tech Plan Review"] },
  { id: "development", label: "切片开发", statuses: ["Developing", "Change Review"] },
  { id: "testing", label: "最终测试", statuses: ["Testing"] },
  { id: "deploy", label: "部署", statuses: ["Deploying"] },
  { id: "delivery", label: "交付验收", statuses: ["Awaiting Acceptance", "Delivered"] },
];

export type AgentRosterEntry = {
  id: string;
  name: string;
  group: "requirement" | "development";
  role: string;
  tier?: string;
};

export const AGENT_ROSTER: AgentRosterEntry[] = [
  { id: "intake", name: "Intake", group: "requirement", role: "需求结构化", tier: "cheap" },
  {
    id: "requirement-analyst",
    name: "Analyst",
    group: "requirement",
    role: "需求分析",
    tier: "standard",
  },
  {
    id: "completeness-scorer",
    name: "Scorer",
    group: "requirement",
    role: "完成度评估",
    tier: "cheap",
  },
  {
    id: "question-planner",
    name: "Question Planner",
    group: "requirement",
    role: "出题",
    tier: "cheap",
  },
  {
    id: "prd-acceptance",
    name: "PRD Agent",
    group: "requirement",
    role: "PRD + 验收标准",
    tier: "standard",
  },
  { id: "architect", name: "Architect", group: "development", role: "技术方案", tier: "strong" },
  {
    id: "test-designer",
    name: "Test Designer",
    group: "development",
    role: "测试设计",
    tier: "standard",
  },
  { id: "planner", name: "Planner", group: "development", role: "切片规划", tier: "strong" },
  { id: "coding", name: "Coding", group: "development", role: "编码实现", tier: "strong" },
  { id: "review", name: "Review", group: "development", role: "代码评审", tier: "strong" },
  { id: "qa", name: "QA", group: "development", role: "测试分析", tier: "standard" },
  {
    id: "devops-delivery",
    name: "DevOps",
    group: "development",
    role: "交付",
    tier: "standard",
  },
];

export const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  pending: "待开始",
  running: "执行中",
  waiting: "等待中",
  gated: "待确认",
  failed: "失败",
  interrupted: "已中断",
  completed: "已完成",
};

export const FINAL_SUITES = [
  { id: "final:typecheck", label: "TypeScript" },
  { id: "final:build", label: "Build" },
  { id: "final:vitest", label: "Vitest" },
  { id: "final:playwright", label: "Playwright E2E" },
] as const;
