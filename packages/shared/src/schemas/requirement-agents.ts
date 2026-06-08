import { z } from "zod";

export const IntakeOutputSchema = z.object({
  normalizedSummary: z.string(),
  targetUsers: z.array(z.string()),
  userGoals: z.array(z.string()),
  appType: z.string(),
  missingContext: z.array(z.string()),
});

export const AnalystOutputSchema = z.object({
  coreFeatures: z.array(z.string()),
  pagesAndFlows: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      userActions: z.array(z.string()),
    }),
  ),
  dataObjects: z.array(
    z.object({
      name: z.string(),
      fields: z.array(z.string()).optional(),
      relationships: z.array(z.string()).optional(),
    }),
  ),
  rolesAndPermissions: z.array(z.string()),
  integrations: z.array(z.string()),
  nonFunctionalRequirements: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export const GapOutputSchema = z.object({
  topic: z.string(),
  severity: z.enum(["low", "medium", "critical"]),
  question: z.string(),
});

export const ScorerOutputSchema = z.object({
  completenessScore: z.number().min(0).max(100),
  gaps: z.array(GapOutputSchema),
});

export const QuestionPlannerOutputSchema = z.object({
  topic: z.string(),
  questions: z.array(z.string()).max(10),
});

export const PrdAcceptanceOutputSchema = z.object({
  prd: z.string(),
  acceptanceCriteria: z.string(),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
});

export type IntakeOutput = z.infer<typeof IntakeOutputSchema>;
export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;
export type ScorerOutput = z.infer<typeof ScorerOutputSchema>;
export type QuestionPlannerOutput = z.infer<typeof QuestionPlannerOutputSchema>;
export type PrdAcceptanceOutput = z.infer<typeof PrdAcceptanceOutputSchema>;
