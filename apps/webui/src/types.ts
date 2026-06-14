export type ProjectStatus = string;

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type EventEnvelope = {
  seq: number;
  timestamp: string;
  projectId?: string;
  runId?: string;
  agentId?: string;
  payload: { type: string; [key: string]: unknown };
};

export type GateInfo = {
  id: string;
  gateType: string;
  status: string;
  options: string[];
  decision?: string | null;
  metadata?: Record<string, unknown>;
};

export type Question = {
  question: string;
  suggestedAnswers: string[];
};

export type ConsoleSnapshot = {
  project: ProjectRecord;
  phase: { label: string; activeGroup: string; progressLabel?: string };
  openGates: GateInfo[];
  pausedFrom?: string;
  requirement?: {
    rawRequirement?: string;
    normalizedSummary?: string;
    completenessScore: number;
    completenessLocked?: boolean;
    pendingQuestions?: Question[];
    settledChips?: string[];
    upcomingChips?: string[];
  };
  dev?: {
    currentSliceId?: string;
    sliceIndex: number;
    sliceTotal: number;
    previewUrl?: string;
  };
  testing?: {
    phase?: string;
    previewUrl?: string;
    suitePassed: number;
    suiteTotal: number;
  };
  integrations?: Array<{
    integrationId: string;
    displayName: string;
    status: string;
  }>;
  events: EventEnvelope[];
  lastSeq: number;
};

export type AgentGroup = "requirement" | "development";
export type AgentStatus = "idle" | "waiting" | "running" | "tool" | "blocked" | "done" | "failed";

export type AgentView = {
  id: string;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  group: AgentGroup;
  status: AgentStatus;
  lastText?: string;
  lastTool?: string;
  toolRuns: number;
  steps: number;
  errors: number;
  artifactCount: number;
  activeSince?: number;
};

export type TimelineEntry = {
  id: string;
  seq: number;
  at: string;
  kind: "user" | "taizi" | "status" | "agent" | "reason" | "tool" | "tool_ok" | "tool_err" | "gate" | "gate_ok" | "artifact" | "error";
  tag: string;
  agent?: string;
  text: string;
  tool?: string;
  summary?: string;
  output?: string;
};

export type FileResult = {
  path: string;
  content: string;
  binary?: boolean;
  absolutePath?: string;
};
