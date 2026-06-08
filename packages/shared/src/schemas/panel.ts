import { z } from "zod";

export const FileScopeSchema = z.enum(["repo", "artifacts", "all"]);

export const FilesListResponseSchema = z.object({
  scope: FileScopeSchema,
  files: z.array(z.string()),
});

export const FileContentResponseSchema = z.object({
  path: z.string(),
  scope: z.enum(["repo", "artifacts"]),
  content: z.string(),
});

export const PanelDiffSummarySchema = z.object({
  diffId: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});

export const DiffsListResponseSchema = z.object({
  diffs: z.array(PanelDiffSummarySchema),
});

export const DiffPatchResponseSchema = z.object({
  diffId: z.string(),
  patch: z.string(),
});

export const TestArtifactLinkSchema = z.object({
  artifactId: z.string(),
  path: z.string(),
  kind: z.string(),
});

export const TestResultRowSchema = z.object({
  suite: z.string(),
  status: z.enum(["passed", "failed", "skipped", "pending"]),
  details: z.string().nullable().optional(),
  artifacts: z.array(TestArtifactLinkSchema).optional(),
});

export const TestsResultsResponseSchema = z.object({
  slice: z.array(TestResultRowSchema),
  final: z.array(TestResultRowSchema),
});

export const PreviewStatusSchema = z.object({
  previewUrl: z.string().optional(),
  deploymentUrl: z.string().optional(),
  health: z.object({
    reachable: z.boolean(),
    statusCode: z.number().optional(),
    playwrightReady: z.boolean().optional(),
    consoleErrorCount: z.number().optional(),
  }),
});

export const ReportSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  emptyReason: z.string().optional(),
});

export const ReportSnapshotSchema = z.object({
  projectStatus: z.string(),
  previewUrl: z.string().optional(),
  deploymentUrl: z.string().optional(),
  risks: z.array(z.string()),
  sections: z.array(ReportSectionSchema),
});

export const CommandGateErrorSchema = z.object({
  error: z.string(),
  gateId: z.string().optional(),
  gateType: z.string().optional(),
});

export type FileScope = z.infer<typeof FileScopeSchema>;
export type FilesListResponse = z.infer<typeof FilesListResponseSchema>;
export type FileContentResponse = z.infer<typeof FileContentResponseSchema>;
export type PanelDiffSummary = z.infer<typeof PanelDiffSummarySchema>;
export type DiffsListResponse = z.infer<typeof DiffsListResponseSchema>;
export type DiffPatchResponse = z.infer<typeof DiffPatchResponseSchema>;
export type TestsResultsResponse = z.infer<typeof TestsResultsResponseSchema>;
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;
export type ReportSnapshot = z.infer<typeof ReportSnapshotSchema>;
