import { z } from "zod";
import type { AgentDefinition } from "@oc/shared";
import type { AuthorizeFn } from "../harness/permission-bridge.js";
import type { CallIntegrationToolDeps } from "@oc/integrations";
import type { ToolContext } from "../tools.js";

export type ToolProtocol = "local" | "mcp" | "skill_pack" | "integration";

const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;

export type RegisteredTool = {
  id: string;
  version: string;
  description: string;
  protocol: ToolProtocol;
  riskLevel: "low" | "medium" | "high";
  permissions: Array<"read" | "write" | "shell" | "network" | "deploy">;
  argsSchema: z.ZodTypeAny;
  impl: (args: unknown, ctx: ToolExecutionContext) => Promise<unknown>;
};

export type ToolExecutionContext = ToolContext & {
  authorize?: AuthorizeFn;
  repoPath?: string;
  task?: unknown;
  callIntegration?: CallIntegrationToolDeps;
  enabledIntegrationIds?: string[];
};

const registry = new Map<string, RegisteredTool>();

function toolKey(idAtVersion: string): string {
  return idAtVersion;
}

export function registerTool(definition: RegisteredTool): void {
  registry.set(toolKey(`${definition.id}@${definition.version}`), definition);
}

export function getTool(idAtVersion: string): RegisteredTool {
  const tool = registry.get(toolKey(idAtVersion));
  if (!tool) {
    throw new Error(`Unknown registered tool: ${idAtVersion}`);
  }
  return tool;
}

export function resolveToolsForAgent(toolIds: string[]): RegisteredTool[] {
  return toolIds.map((id) => getTool(id));
}

/** Enforce agent allowlist: tool risk and permissions must fit the agent policy. */
export function assertAgentMayUseTool(agent: AgentDefinition, tool: RegisteredTool): void {
  if (RISK_RANK[tool.riskLevel] > RISK_RANK[agent.riskLevel]) {
    throw new Error(
      `Agent ${agent.id}@${agent.version} cannot use higher-risk tool ${tool.id}@${tool.version}`,
    );
  }

  for (const permission of tool.permissions) {
    if (!agent.permissions.includes(permission)) {
      throw new Error(
        `Agent ${agent.id}@${agent.version} lacks permission "${permission}" for tool ${tool.id}@${tool.version}`,
      );
    }
  }
}

export function listRegisteredTools(): RegisteredTool[] {
  return [...registry.values()];
}

export function clearToolRegistryForTests(): void {
  registry.clear();
}

export function resetToolRegistryForTests(): void {
  registry.clear();
}
