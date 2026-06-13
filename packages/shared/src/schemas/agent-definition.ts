import { z } from "zod";

export const AgentIntegrationAccessSchema = z.enum(["none", "auto"]);

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  version: z.string(),
  group: z.enum(["requirement", "development", "orchestration"]),
  role: z.string(),
  description: z.string(),
  inputSchema: z.unknown(),
  outputSchema: z.unknown(),
  tools: z.array(z.string()),
  modelPolicy: z.object({
    tier: z.enum(["cheap", "standard", "strong"]),
    supportsReasoning: z.boolean().optional(),
  }),
  riskLevel: z.enum(["low", "medium", "high"]),
  permissions: z.array(z.enum(["read", "write", "shell", "network", "deploy"])),
  executor: z.string(),
  /**
   * Whether this agent may use integration/MCP tools.
   * - "none"/undefined: no integration tools (default, preserves existing behavior)
   * - "auto": expose integration tools filtered by canAgentUseIntegrationTool
   * Replaces the old bind-tools.ts `agent.id === "qa"` hardcode.
   */
  integrationAccess: AgentIntegrationAccessSchema.optional(),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type AgentIntegrationAccess = z.infer<typeof AgentIntegrationAccessSchema>;
