import { z } from "zod";

export const FINAL_SUITE_IDS = [
  "final:typecheck",
  "final:build",
  "final:vitest",
  "final:playwright",
] as const;

export const FinalSuiteIdSchema = z.enum(FINAL_SUITE_IDS);

export const NormalizedRunnerResultSchema = z.object({
  suite: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  passedCount: z.number().optional(),
  failedCount: z.number().optional(),
  details: z.string().optional(),
  logRef: z.string().optional(),
  artifactRefs: z.array(z.string()).optional(),
});

export const IntegrationVerificationArtifactSchema = z.object({
  label: z.enum(["baseline", "diagnostic"]),
  toolName: z.string(),
  mode: z.enum(["remote", "offline", "pending"]),
  artifactPath: z.string().optional(),
  summary: z.string().optional(),
});

export const TestingSessionMetaSchema = z.object({
  phase: z.enum(["idle", "running", "passed", "failed"]),
  previewUrl: z.string().optional(),
  lastRunAt: z.string().optional(),
  suiteResults: z.array(NormalizedRunnerResultSchema),
  qaNotes: z.array(z.string()).optional(),
  integrationArtifacts: z.array(IntegrationVerificationArtifactSchema).optional(),
  integrationNotes: z.array(z.string()).optional(),
});

export type FinalSuiteId = z.infer<typeof FinalSuiteIdSchema>;
export type NormalizedRunnerResult = z.infer<typeof NormalizedRunnerResultSchema>;
export type IntegrationVerificationArtifact = z.infer<
  typeof IntegrationVerificationArtifactSchema
>;
export type TestingSessionMeta = z.infer<typeof TestingSessionMetaSchema>;

export function isFinalSuite(suite: string): boolean {
  return suite.startsWith("final:");
}

export function isSliceSuite(suite: string): boolean {
  return suite.startsWith("slice:");
}

export function sliceSuiteId(sliceId: string): string {
  return sliceId.startsWith("slice:") ? sliceId : `slice:${sliceId}`;
}
