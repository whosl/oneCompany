import { z } from "zod";
import { DEFAULT_MAX_SLICE_ATTEMPTS } from "./project-status.js";

export const FunctionSliceTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  acceptanceChecks: z.array(z.string()).optional(),
  testCommand: z.string(),
  expectedFiles: z.array(z.string()).optional(),
  status: z.enum(["pending", "in_progress", "passed", "failed", "skipped"]).optional(),
});

export const TestResultSchema = z.object({
  suite: z.string(),
  status: z.enum(["passed", "failed"]),
  details: z.string().optional(),
});

export const DiffSummarySchema = z.object({
  diffId: z.string(),
  summary: z.string(),
  path: z.string().optional(),
});

export const DevStateSchema = z.object({
  projectId: z.string(),
  repoPath: z.string(),
  worktreePath: z.string(),
  sandboxMode: z.enum(["local", "docker"]),
  techPlanVersion: z.string(),
  taskQueue: z.array(FunctionSliceTaskSchema),
  currentTask: FunctionSliceTaskSchema.optional(),
  maxSliceAttempts: z.number().default(DEFAULT_MAX_SLICE_ATTEMPTS),
  currentSliceAttempts: z.number(),
  testResults: z.array(TestResultSchema),
  diffs: z.array(DiffSummarySchema),
  commits: z.array(
    z.object({
      hash: z.string(),
      taskId: z.string(),
      summary: z.string(),
    }),
  ),
  previewUrl: z.string().optional(),
  deploymentUrl: z.string().optional(),
  deliveryArtifacts: z.array(z.string()),
  risks: z.array(z.string()),
});

export type FunctionSliceTask = z.infer<typeof FunctionSliceTaskSchema>;
export type TestResult = z.infer<typeof TestResultSchema>;
export type DiffSummary = z.infer<typeof DiffSummarySchema>;
export type DevState = z.infer<typeof DevStateSchema>;
