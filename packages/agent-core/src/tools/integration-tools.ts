import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { AgentDefinition } from "@oc/shared";
import {
  callIntegrationTool,
  getConnectionForProject,
  listIntegrations,
  type CallIntegrationToolDeps,
} from "@oc/integrations";
import type { DevAgentTask } from "../agents/development/types.js";
import type { ToolExecutionContext } from "./registry.js";

const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;

export function qaIntegrationToolsEnabled(): boolean {
  return process.env.OC_QA_INTEGRATION_TOOLS !== "0";
}

function integrationToolName(integrationId: string, toolName: string): string {
  return `integration__${integrationId}__${toolName}`;
}

function canAgentUseIntegrationTool(
  agent: AgentDefinition,
  integration: {
    riskLevel: "low" | "medium" | "high";
    permissions: string[];
    highRiskTools?: string[];
  },
  toolName: string,
): boolean {
  if (integration.highRiskTools?.includes(toolName)) {
    return false;
  }
  if (RISK_RANK[integration.riskLevel] > RISK_RANK[agent.riskLevel]) {
    return false;
  }
  for (const permission of integration.permissions) {
    if (
      ["write", "deploy", "secrets", "billing", "network"].includes(permission) &&
      !agent.permissions.includes(permission as AgentDefinition["permissions"][number])
    ) {
      return false;
    }
  }
  return true;
}

function mergeIntegrationArgs(toolName: string, args: unknown, task: unknown): Record<string, unknown> {
  const record =
    args && typeof args === "object" && !Array.isArray(args)
      ? { ...(args as Record<string, unknown>) }
      : {};
  const devTask = task as DevAgentTask | undefined;
  const previewUrl = devTask?.testingContext?.previewUrl;
  if (previewUrl && ["screenshot", "console_errors", "navigate"].includes(toolName)) {
    return { previewUrl, url: previewUrl, ...record };
  }
  return record;
}

function resolveEnabledIntegrationIds(execCtx: ToolExecutionContext): string[] {
  if (execCtx.enabledIntegrationIds?.length) {
    return execCtx.enabledIntegrationIds;
  }
  return listIntegrations()
    .filter((definition) => {
      // Auto-available: definitions with no secret requirements (codegraph,
      // context7) are always enabled without a user-created connection.
      if (definition.secretRefs.length === 0) return true;
      const connection = getConnectionForProject(execCtx.db, execCtx.projectId, definition.id);
      return (
        connection &&
        connection.status !== "disabled" &&
        connection.status !== "not_configured"
      );
    })
    .map((definition) => definition.id);
}

export function buildIntegrationLangChainTools(
  agent: AgentDefinition,
  execCtx: ToolExecutionContext,
): StructuredToolInterface[] {
  if (!execCtx.callIntegration || !qaIntegrationToolsEnabled()) {
    return [];
  }

  const enabledIds = new Set(resolveEnabledIntegrationIds(execCtx));
  const tools: StructuredToolInterface[] = [];

  for (const definition of listIntegrations()) {
    if (!enabledIds.has(definition.id)) {
      continue;
    }

    for (const toolName of definition.toolAllowlist) {
      if (!canAgentUseIntegrationTool(agent, definition, toolName)) {
        continue;
      }

      const name = integrationToolName(definition.id, toolName);
      tools.push(
        tool(
          async (args) => {
            const deps: CallIntegrationToolDeps = {
              ...execCtx.callIntegration!,
              caller: "agent",
            };
            const result = await callIntegrationTool(deps, {
              integrationId: definition.id,
              toolName,
              args: mergeIntegrationArgs(toolName, args, execCtx.task),
            });
            return JSON.stringify({
              mode: result.mode,
              gateId: result.gateId,
              artifactPath: result.artifactPath,
              output: result.output,
            });
          },
          {
            name,
            description: `${definition.displayName} — ${toolName} (governed integration gateway)`,
            schema: {
              type: "object",
              additionalProperties: true,
            },
          },
        ),
      );
    }
  }

  return tools;
}
