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
  /**
   * Capability tags exposed on the A2A Agent Card and visible to other agents
   * via the pipeline-context section of the system prompt. Examples:
   * "requirement-normalization", "tdd-implementation", "code-review".
   * Optional so historical DB rows keep parsing without a migration.
   */
  capabilities: z.array(z.string()).optional(),
  /**
   * Structured skill entries mapped 1:1 to A2A AgentCard.skills. Optional for
   * the same backwards-compat reason as `capabilities`.
   */
  skills: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
  /** One-line description of the input this agent expects. */
  defaultInputSummary: z.string().optional(),
  /**
   * One-line description of what this agent produces and who consumes it.
   * Drives the "pipeline context" injected into every agent's system prompt so
   * each agent knows its upstream and downstream.
   */
  outputHandoff: z.string().optional(),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type AgentIntegrationAccess = z.infer<typeof AgentIntegrationAccessSchema>;
