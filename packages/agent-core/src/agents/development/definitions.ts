import type { AgentDefinition, Db } from "@oc/shared";
import { registerAgent } from "../../registry.js";

const AGENT_VERSION = "1.0.0";

export const DEVELOPMENT_AGENT_IDS = {
  architect: `architect@${AGENT_VERSION}`,
  planner: `planner@${AGENT_VERSION}`,
  coding: `coding@${AGENT_VERSION}`,
  review: `review@${AGENT_VERSION}`,
  qa: `qa@${AGENT_VERSION}`,
  devopsDelivery: `devops-delivery@${AGENT_VERSION}`,
} as const;

export const DEVELOPMENT_AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "architect",
    version: AGENT_VERSION,
    group: "development",
    role: "架构师 Agent",
    description: "产出含 Web 前端层的可执行技术方案",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: ["read-artifact@1.0.0", "workspace-read@1.0.0"],
    modelPolicy: { tier: "strong" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
  {
    id: "planner",
    version: AGENT_VERSION,
    group: "development",
    role: "切片规划 Agent",
    description: "把验收标准拆分为含 Web UI 交付物与 vitest 测试的有序功能切片",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "strong" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
  {
    id: "coding",
    version: AGENT_VERSION,
    group: "development",
    role: "编码 Agent",
    description: "实现功能切片（含 Web 页面）并保证测试通过",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: ["shell", "edit"],
    modelPolicy: { tier: "strong" },
    riskLevel: "medium",
    permissions: ["read", "write"],
    executor: "scripted",
  },
  {
    id: "review",
    version: AGENT_VERSION,
    group: "development",
    role: "代码审查 Agent",
    description: "审查切片改动的正确性与一致性",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "strong" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
  {
    id: "qa",
    version: AGENT_VERSION,
    group: "development",
    role: "质量验证 Agent",
    description: "验证 Preview 展示真实产品 Web UI，可调用受管控的集成工具",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "standard" },
    riskLevel: "medium",
    permissions: ["read", "network"],
    executor: "scripted",
  },
  {
    id: "devops-delivery",
    version: AGENT_VERSION,
    group: "development",
    role: "交付运维 Agent",
    description: "汇总交付产物并撰写含浏览器访问方式的部署说明",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "standard" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
];

export function registerDevelopmentAgents(db: Db): void {
  for (const definition of DEVELOPMENT_AGENT_DEFINITIONS) {
    registerAgent(db, definition);
  }
}
