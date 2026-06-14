import type { AgentDefinition, Db } from "@oc/shared";
import { registerAgent } from "../../registry.js";

const AGENT_VERSION = "1.0.0";

export const REQUIREMENT_AGENT_IDS = {
  intake: `intake@${AGENT_VERSION}`,
  analyst: `requirement-analyst@${AGENT_VERSION}`,
  scorer: `completeness-scorer@${AGENT_VERSION}`,
  questionPlanner: `question-planner@${AGENT_VERSION}`,
  prdAcceptance: `prd-acceptance@${AGENT_VERSION}`,
} as const;

export const REQUIREMENT_AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "intake",
    version: AGENT_VERSION,
    group: "requirement",
    role: "需求录入 Agent",
    description: "把用户的原始输入整理成规范的需求概述",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "cheap" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
    capabilities: ["requirement-normalization"],
    defaultInputSummary: "用户的一句话原始业务需求",
    outputHandoff: "规范化需求摘要 + 目标用户/目标，交给需求分析 Agent 做结构化提取",
  },
  {
    id: "requirement-analyst",
    version: AGENT_VERSION,
    group: "requirement",
    role: "需求分析 Agent",
    description: "从需求中提取结构化信息（功能、流程、数据、角色）",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: ["requirement-context@1.0.0"],
    modelPolicy: { tier: "strong" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
    capabilities: ["requirement-analysis", "structured-extraction"],
    defaultInputSummary: "Intake 规范化后的需求状态",
    outputHandoff: "结构化需求模型（功能/页面/数据/角色/集成），交给完整度评分 Agent 判定是否达标",
  },
  {
    id: "completeness-scorer",
    version: AGENT_VERSION,
    group: "requirement",
    role: "完整度评分 Agent",
    description: "评估需求完整度并识别业务缺口",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "cheap" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
    capabilities: ["completeness-scoring", "gap-analysis"],
    defaultInputSummary: "Analyst 产出的结构化需求状态",
    outputHandoff: "0-100 完整度分数 + 缺口列表；达标则交给 PRD Agent，否则交给问题规划 Agent 追问",
  },
  {
    id: "question-planner",
    version: AGENT_VERSION,
    group: "requirement",
    role: "澄清问题规划 Agent",
    description: "规划聚焦业务的澄清问题轮次",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "cheap" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
    capabilities: ["clarification-planning"],
    defaultInputSummary: "未达标的需求状态 + Scorer 识别的缺口",
    outputHandoff: "一轮聚焦业务的澄清问题（含建议答案），等待用户作答后回到 Scorer 重新评分",
  },
  {
    id: "prd-acceptance",
    version: AGENT_VERSION,
    group: "requirement",
    role: "PRD 与验收 Agent",
    description: "产出 PRD 与可验证的验收标准（须含浏览器 UI 行为）",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "standard" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
    capabilities: ["prd-generation", "acceptance-criteria"],
    defaultInputSummary: "达标的需求状态（分数 ≥ 阈值且无关键缺口）",
    outputHandoff: "PRD + 验收标准；经需求确认 Gate 后作为开发组的唯一业务基线，交给 Architect",
  },
];

export function registerRequirementAgents(db: Db): void {
  for (const definition of REQUIREMENT_AGENT_DEFINITIONS) {
    registerAgent(db, definition);
  }
}
