import type { AgentDefinition, Db } from "@oc/shared";
import { registerAgent } from "../../registry.js";
import { LOCAL_TOOL_IDS } from "../../tools/local-tools.js";
import { ensureTaiziToolsRegistered, TAIZI_READ_TOOL_IDS } from "./local-tools.js";

const AGENT_VERSION = "1.0.0";

export const TAIZI_AGENT_ID = `taizi@${AGENT_VERSION}` as const;

export const TAIZI_AGENT_DEFINITION: AgentDefinition = {
  id: "taizi",
  version: AGENT_VERSION,
  group: "orchestration",
  role: "太子调度 Agent",
  description:
    "接收用户在任意阶段的自由输入，判断意图并分发给对应的 agent / 工作流动作；信息类问题可调用只读工具调研后作答",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  tools: [...TAIZI_READ_TOOL_IDS],
  modelPolicy: { tier: "cheap" },
  riskLevel: "low",
  permissions: ["read"],
  executor: "scripted",
  capabilities: ["intent-routing", "status-research", "natural-language-dispatch"],
  defaultInputSummary: "用户的自由文本消息 + 项目上下文快照（状态/打开的 Gate/活跃会话）",
  outputHandoff:
    "调度决策（13 类意图）→ 分发到对应 agent 或工作流动作；或只读调研后的自然语言回答",
};

export function registerTaiziAgent(db: Db): void {
  ensureTaiziToolsRegistered();
  registerAgent(db, TAIZI_AGENT_DEFINITION);
}

/** Re-export for tests / callers that need the full read-only allowlist. */
export { LOCAL_TOOL_IDS, TAIZI_READ_TOOL_IDS };
