import { z } from "zod";
import type { AuthorizeFn } from "../harness/permission-bridge.js";
import type { ToolContext } from "../tools.js";

export type ToolProtocol = "local" | "mcp" | "skill_pack";

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

export function listRegisteredTools(): RegisteredTool[] {
  return [...registry.values()];
}

export function clearToolRegistryForTests(): void {
  registry.clear();
}

export function resetToolRegistryForTests(): void {
  registry.clear();
}
