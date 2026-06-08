import { z } from "zod";

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  version: z.string(),
  group: z.enum(["requirement", "development"]),
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
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
