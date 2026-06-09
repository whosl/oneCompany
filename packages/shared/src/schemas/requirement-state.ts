import { z } from "zod";
import { DEFAULT_COMPLETENESS_THRESHOLD, DEFAULT_MAX_QUESTION_ROUNDS } from "./project-status.js";

function coerceStoredQuestionItem(value: unknown) {
  if (typeof value === "string") {
    return { question: value, suggestedAnswers: [] as string[] };
  }
  if (value && typeof value === "object" && "question" in value) {
    const record = value as { question?: string; suggestedAnswers?: string[] };
    return {
      question: record.question ?? "",
      suggestedAnswers: record.suggestedAnswers ?? [],
    };
  }
  return { question: String(value), suggestedAnswers: [] as string[] };
}

const PageAndFlowSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  userActions: z.array(z.string()),
});

const DataObjectSchema = z.object({
  name: z.string(),
  fields: z.array(z.string()).optional(),
  relationships: z.array(z.string()).optional(),
});

const GapSchema = z.object({
  topic: z.string(),
  severity: z.enum(["low", "medium", "critical"]),
  question: z.string(),
});

const StoredQuestionItemSchema = z.object({
  question: z.string(),
  suggestedAnswers: z.array(z.string()).max(3).default([]),
});

const QuestionRoundSchema = z.object({
  topic: z.string(),
  questions: z.array(z.preprocess(coerceStoredQuestionItem, StoredQuestionItemSchema)),
  answers: z.array(z.string()),
  scoreAfter: z.number(),
});

export const RequirementStateSchema = z.object({
  projectId: z.string(),
  rawRequirement: z.string(),
  normalizedSummary: z.string(),
  targetUsers: z.array(z.string()),
  userGoals: z.array(z.string()),
  coreFeatures: z.array(z.string()),
  pagesAndFlows: z.array(PageAndFlowSchema),
  dataObjects: z.array(DataObjectSchema),
  rolesAndPermissions: z.array(z.string()),
  integrations: z.array(z.string()),
  nonFunctionalRequirements: z.array(z.string()),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  gaps: z.array(GapSchema),
  completenessScore: z.number(),
  completenessThreshold: z.number().default(DEFAULT_COMPLETENESS_THRESHOLD),
  maxQuestionRounds: z.number().default(DEFAULT_MAX_QUESTION_ROUNDS),
  questionRounds: z.array(QuestionRoundSchema),
  prdVersion: z.string().optional(),
  acceptanceCriteriaVersion: z.string().optional(),
});

export type RequirementState = z.infer<typeof RequirementStateSchema>;
