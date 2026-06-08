import { z } from "zod";

export const ArchitectOutputSchema = z.object({
  techPlan: z.string(),
  stack: z.array(z.string()),
  architectureNotes: z.array(z.string()),
  risks: z.array(z.string()),
});

export const TestDesignerOutputSchema = z.object({
  testSpecs: z.array(
    z.object({
      sliceId: z.string(),
      testCommand: z.string(),
      description: z.string(),
    }),
  ),
});

export const PlannerSliceSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  acceptanceChecks: z.array(z.string()).optional(),
  testCommand: z.string(),
  expectedFiles: z.array(z.string()).optional(),
});

export const PlannerOutputSchema = z.object({
  slices: z.array(PlannerSliceSchema).min(1),
  planningNotes: z.array(z.string()).optional(),
});

export const CodingOutputSchema = z.object({
  summary: z.string(),
  changedFiles: z.array(z.string()),
  testsAdded: z.array(z.string()).optional(),
});

export const ReviewOutputSchema = z.object({
  approved: z.boolean(),
  findings: z.array(z.string()),
  summary: z.string(),
});

export const QaOutputSchema = z.object({
  passed: z.boolean(),
  notes: z.array(z.string()),
  coverageSummary: z.string().optional(),
});

export const DevopsDeliveryOutputSchema = z.object({
  artifacts: z.array(z.string()),
  deploymentNotes: z.string(),
  previewHints: z.array(z.string()).optional(),
});

export type ArchitectOutput = z.infer<typeof ArchitectOutputSchema>;
export type TestDesignerOutput = z.infer<typeof TestDesignerOutputSchema>;
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;
export type CodingOutput = z.infer<typeof CodingOutputSchema>;
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;
export type QaOutput = z.infer<typeof QaOutputSchema>;
export type DevopsDeliveryOutput = z.infer<typeof DevopsDeliveryOutputSchema>;
