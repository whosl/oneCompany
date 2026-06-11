/** API DTOs mirrored from @oc/api + @oc/shared (kept standalone on purpose). */

export type Json = Record<string, unknown>;

export type ProjectStatus =
  | "Draft Requirement"
  | "Asking Questions"
  | "PRD Ready"
  | "Tech Plan Review"
  | "Developing"
  | "Change Review"
  | "Testing"
  | "Deploying"
  | "Awaiting Acceptance"
  | "Delivered"
  | "Failed"
  | "Paused"
  | (string & {});

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type GateInfo = {
  id: string;
  projectId?: string;
  gateType: string;
  status?: "open" | "resolved";
  options: string[];
  decision?: string | null;
  metadata?: Json;
  createdAt?: string;
};

export type PendingQuestion = {
  question: string;
  suggestedAnswers: string[];
};

export type ConsoleRequirementSnapshot = {
  rawRequirement: string;
  normalizedSummary: string;
  completenessScore: number;
  completenessLocked: boolean;
  settledChips: string[];
  upcomingChips: string[];
  pendingQuestions?: PendingQuestion[];
};

export type ConsoleIntegrationSnapshot = {
  integrationId: string;
  displayName: string;
  status: string;
};

export type ConsoleSnapshot = {
  project: ProjectRecord;
  phase: { label: string; activeGroup: string; progressLabel?: string };
  requirement?: ConsoleRequirementSnapshot;
  integrations?: ConsoleIntegrationSnapshot[];
  dev?: {
    currentSliceId?: string;
    sliceIndex: number;
    sliceTotal: number;
    previewUrl?: string;
  };
  testing?: {
    phase: string;
    previewUrl?: string;
    suitePassed: number;
    suiteTotal: number;
  };
  openGates: GateInfo[];
  events: EventEnvelope[];
  lastSeq: number;
  pausedFrom?: string;
};

export type EventEnvelope = {
  eventId?: string;
  seq: number;
  timestamp: string;
  projectId?: string;
  runId?: string;
  agentId?: string;
  payload: { type: string; [key: string]: unknown };
};

export type Readiness = {
  workspaceRoot?: string;
  apiKeyReady: boolean;
  engine?: {
    workflowLlmReady?: boolean;
    opencodeCliReady?: boolean;
    opencodeModelReady?: boolean;
  };
  degradedModes?: string[];
};

export type RequirementRunResult = {
  phase: "running" | "awaiting_answers" | "awaiting_gate" | "completed" | "failed" | (string & {});
  projectStatus: ProjectStatus;
  questions?: string[];
  gateId?: string;
  gateType?: string;
  gateOptions?: string[];
};

export type DevelopmentRunResult = {
  phase: string;
  projectStatus: ProjectStatus;
  gateId?: string;
  gateType?: string;
  gateOptions?: string[];
};

export type TestingRunResult = {
  phase: string;
  projectStatus: ProjectStatus;
  previewUrl?: string;
  gateId?: string;
};

export type ChangeRequestResult = {
  changeRequestId: string;
  phase: string;
  projectStatus: ProjectStatus;
  gateId?: string;
};

export type TuiOptions = {
  apiBase: string;
  stub: boolean;
  projectId?: string;
};
