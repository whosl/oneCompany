import { z } from "zod";
import { ProjectStatusSchema } from "./project-status.js";
import { EventEnvelopeSchema } from "./event-envelope.js";

export const ConsolePhaseSchema = z.object({
  label: z.string(),
  activeGroup: z.string(),
  progressLabel: z.string().optional(),
});

export const ConsoleRequirementSnapshotSchema = z.object({
  rawRequirement: z.string(),
  normalizedSummary: z.string(),
  completenessScore: z.number(),
  completenessLocked: z.boolean(),
  settledChips: z.array(z.string()),
  upcomingChips: z.array(z.string()),
});

export const ConsoleDevSnapshotSchema = z.object({
  currentSliceId: z.string().optional(),
  sliceIndex: z.number(),
  sliceTotal: z.number(),
  previewUrl: z.string().optional(),
});

export const ConsoleGateSnapshotSchema = z.object({
  id: z.string(),
  gateType: z.string(),
  status: z.enum(["open", "resolved"]),
  options: z.array(z.string()),
  decision: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const ConsoleSnapshotSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    status: ProjectStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  phase: ConsolePhaseSchema,
  requirement: ConsoleRequirementSnapshotSchema.optional(),
  dev: ConsoleDevSnapshotSchema.optional(),
  testing: z
    .object({
      phase: z.string(),
      previewUrl: z.string().optional(),
      suitePassed: z.number(),
      suiteTotal: z.number(),
    })
    .optional(),
  risks: z.array(z.string()),
  openGates: z.array(ConsoleGateSnapshotSchema),
  pausedFrom: ProjectStatusSchema.optional(),
  events: z.array(EventEnvelopeSchema),
  lastSeq: z.number(),
});

export const EnvironmentReadinessSchema = z.object({
  workspaceRoot: z.string(),
  generatedProjectsRoot: z.string(),
  databasePath: z.string(),
  apiKeyReady: z.boolean(),
  tunnelConfigured: z.boolean(),
  checks: z.object({
    node: z.boolean(),
    pnpm: z.boolean(),
    git: z.boolean(),
    docker: z.boolean(),
    playwright: z.boolean(),
    sqlite: z.boolean(),
  }),
  policies: z.array(z.string()),
});

export const StreamItemOriginSchema = z.enum(["user", "agent", "system", "gate"]);

export const StreamItemSchema = z.object({
  id: z.string(),
  origin: StreamItemOriginSchema,
  kind: z.string(),
  title: z.string(),
  summary: z.string(),
  timestamp: z.string(),
  expanded: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SwimlaneCellSchema = z.object({
  agentId: z.string(),
  phase: z.enum(["plan", "act", "observe", "reflect", "user", "gate"]),
  summary: z.string(),
  status: z.enum(["active", "completed", "failed", "empty"]),
});

export type ConsoleSnapshot = z.infer<typeof ConsoleSnapshotSchema>;
export type EnvironmentReadiness = z.infer<typeof EnvironmentReadinessSchema>;
export type StreamItem = z.infer<typeof StreamItemSchema>;
export type SwimlaneCell = z.infer<typeof SwimlaneCellSchema>;
export type ConsolePhase = z.infer<typeof ConsolePhaseSchema>;
