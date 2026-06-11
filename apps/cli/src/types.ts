export type Json = Record<string, unknown>;

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type GateRecord = {
  id: string;
  projectId: string;
  gateType: string;
  status: "open" | "resolved";
  options: string[];
  decision: string | null;
};

export type RequirementRunResult = {
  phase: string;
  projectStatus: string;
  questions?: string[];
  gateId?: string;
  gateType?: string;
  gateOptions?: string[];
};

export type DevelopmentRunResult = {
  phase: string;
  projectStatus: string;
  gateId?: string;
  gateType?: string;
  gateOptions?: string[];
};

export type TestingRunResult = {
  phase: string;
  projectStatus: string;
  gateId?: string;
};

export type ConsoleRequirementSnapshot = {
  rawRequirement: string;
  normalizedSummary: string;
  completenessScore: number;
  completenessLocked: boolean;
  settledChips: string[];
  upcomingChips: string[];
  pendingQuestions?: Array<{ question: string; suggestedAnswers: string[] }>;
};

export type ConsoleSnapshot = {
  project: ProjectRecord;
  phase: { label: string; activeGroup: string; progressLabel?: string };
  requirement?: ConsoleRequirementSnapshot;
  dev?: { currentSliceId?: string; sliceIndex: number; sliceTotal: number; previewUrl?: string };
  testing?: { phase: string; previewUrl?: string; suitePassed: number; suiteTotal: number };
  openGates: Array<{ id: string; gateType: string; options: string[] }>;
  events: EventEnvelope[];
  lastSeq: number;
};

export type RenderMode = "idle" | "running" | "gate" | "question" | "done" | "error";

export type EventEnvelope = {
  seq: number;
  timestamp: string;
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
  /** @deprecated use engine.opencodeCliReady */
  opencodeReady?: boolean;
  degradedModes?: string[];
};

export type LogLine = {
  at: string;
  kind: "agent" | "reason" | "tool" | "gate" | "test" | "status" | "error" | "info";
  agent?: string;
  agentId?: string;
  phase?: "started" | "plan" | "act" | "observe" | "reflect";
  toolName?: string;
  text: string;
};

export type EventDisplayContext = {
  lastAgentId?: string;
  lastAgentName?: string;
  toolNames: Map<string, string>;
};

export type CliOptions = {
  apiBase: string;
  auto: boolean;
  stub: boolean;
  requirement: string;
  projectName: string;
};
