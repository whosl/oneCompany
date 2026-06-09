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

export const RequirementQuestionItemSchema = z.object({
  question: z.string(),
  suggestedAnswers: z.array(z.string()).min(1).max(3),
});

function coerceRequirementQuestionItem(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return {
      question: trimmed,
      suggestedAnswers: [
        "Proceed as described in the current requirement",
        "Use a narrower MVP scope",
        "Expand scope with additional features",
      ],
    };
  }
  if (value && typeof value === "object" && "question" in value) {
    const record = value as { question?: string; suggestedAnswers?: string[] };
    const question = record.question?.trim() ?? "";
    const suggestedAnswers = (record.suggestedAnswers ?? [])
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 3);
    return {
      question,
      suggestedAnswers:
        suggestedAnswers.length > 0
          ? suggestedAnswers
          : [
              "Proceed as described in the current requirement",
              "Use a narrower MVP scope",
              "Expand scope with additional features",
            ],
    };
  }
  return {
    question: String(value),
    suggestedAnswers: [
      "Proceed as described in the current requirement",
      "Use a narrower MVP scope",
      "Expand scope with additional features",
    ],
  };
}

export const QuestionPlannerOutputSchema = z.object({
  topic: z.string(),
  questions: z
    .preprocess(
      (value) => (Array.isArray(value) ? value.map(coerceRequirementQuestionItem) : []),
      z.array(RequirementQuestionItemSchema).max(10),
    ),
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
export type RequirementQuestionItem = z.infer<typeof RequirementQuestionItemSchema>;
export type QuestionPlannerOutput = z.infer<typeof QuestionPlannerOutputSchema>;
export type PrdAcceptanceOutput = z.infer<typeof PrdAcceptanceOutputSchema>;
