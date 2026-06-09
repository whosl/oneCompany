import { z } from "zod";

const SECRET_VALUE_PATTERN =
  /(?:sk-[a-zA-Z0-9_-]{10,}|ghp_[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9._-]{10,})/;

export const IntegrationProtocolSchema = z.enum(["mcp", "native", "skill_pack"]);
export const IntegrationModeSchema = z.enum(["remote", "local", "offline"]);
export const IntegrationPermissionSchema = z.enum([
  "read",
  "write",
  "shell",
  "network",
  "deploy",
  "secrets",
  "billing",
]);
export const IntegrationRiskLevelSchema = z.enum(["low", "medium", "high"]);
export const IntegrationConnectionStatusSchema = z.enum([
  "not_configured",
  "connected",
  "expired",
  "offline_fallback",
  "disabled",
]);

export const IntegrationDefinitionSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    protocol: IntegrationProtocolSchema,
    mode: IntegrationModeSchema,
    displayName: z.string().min(1),
    description: z.string().min(1),
    serverCommand: z.string().optional(),
    serverUrl: z.string().url().optional(),
    toolAllowlist: z.array(z.string().min(1)).min(1),
    resourceAllowlist: z.array(z.string()).optional(),
    permissions: z.array(IntegrationPermissionSchema).min(1),
    riskLevel: IntegrationRiskLevelSchema,
    secretRefs: z.array(z.string().min(1)).default([]),
    offlineFallbackSkillPackId: z.string().optional(),
    highRiskTools: z.array(z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    const serialized = JSON.stringify(value);
    if (SECRET_VALUE_PATTERN.test(serialized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Integration definitions must not contain secret values",
      });
    }
    for (const ref of value.secretRefs) {
      if (SECRET_VALUE_PATTERN.test(ref) || ref.includes("=")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secretRefs"],
          message: "secretRefs must be names only, never values",
        });
      }
    }
  });

export const IntegrationConnectionSchema = z.object({
  id: z.string().min(1),
  integrationId: z.string().min(1),
  integrationVersion: z.string().min(1),
  projectId: z.string().min(1),
  accountLabel: z.string().min(1),
  scopes: z.array(z.string()),
  status: IntegrationConnectionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SkillPackSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  replacesIntegrationIds: z.array(z.string().min(1)).min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
  requiredLocalTools: z.array(z.string()).default([]),
  docsPath: z.string().default("docs"),
  templatesPath: z.string().optional(),
  recipesPath: z.string().optional(),
  scriptsPath: z.string().optional(),
  testsPath: z.string().optional(),
});

export type IntegrationDefinition = z.infer<typeof IntegrationDefinitionSchema>;
export type IntegrationConnection = z.infer<typeof IntegrationConnectionSchema>;
export type IntegrationConnectionStatus = z.infer<typeof IntegrationConnectionStatusSchema>;
export type SkillPack = z.infer<typeof SkillPackSchema>;

export type IntegrationStatusSnapshot = {
  integrationId: string;
  displayName: string;
  version: string;
  status: IntegrationConnectionStatus;
  secretReadiness: Array<{ ref: string; configured: boolean }>;
  offlineFallbackSkillPackId?: string;
  scopes: string[];
};
