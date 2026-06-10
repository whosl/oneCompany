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
    modelPolicy: { tier: "standard" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
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
  },
  {
    id: "prd-acceptance",
    version: AGENT_VERSION,
    group: "requirement",
    role: "PRD 与验收 Agent",
    description: "产出 PRD 与可验证的验收标准",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "standard" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
];

export function registerRequirementAgents(db: Db): void {
  for (const definition of REQUIREMENT_AGENT_DEFINITIONS) {
    registerAgent(db, definition);
  }
}
