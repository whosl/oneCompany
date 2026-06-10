export type ConsoleMode = "stream" | "swimlane";

export type WorkspaceTabId = "Files" | "Preview" | "Terminal" | "Tests" | "Report";

export type UiV2ComposerMode =
  | "requirement"
  | "question_round"
  | "gate_decision"
  | "change_request"
  | "deployment_url"
  | "read_only"
  | "paused";

export type AgentGroupId = "orchestrator" | "requirement" | "development";

export type AgentStepName = "Plan" | "Act" | "Observe" | "Reflect";

export type AgentRunStatus =
  | "completed"
  | "running"
  | "waiting"
  | "gated"
  | "failed"
  | "interrupted"
  | "pending";

export type AgentGroup = {
  id: AgentGroupId;
  label: string;
  summary: string;
  status: AgentRunStatus;
};

export type AgentStep = {
  name: AgentStepName;
  summary: string;
  status: AgentRunStatus;
};

export type AgentRun = {
  id: string;
  agentId: string;
  agentName: string;
  groupId: AgentGroupId;
  groupLabel: string;
  role: string;
  status: AgentRunStatus;
  currentStep: AgentStepName;
  summary: string;
  steps: AgentStep[];
  tools: string[];
  diffs: string[];
  tests: string[];
  artifacts: string[];
  firstSeq: number;
  lastSeq: number;
  risk?: string;
};

export type StreamItem = {
  id: string;
  seq: number;
  type:
    | "user"
    | "orchestrator"
    | "group"
    | "agent-run"
    | "tool"
    | "diff"
    | "test"
    | "gate"
    | "artifact";
  title: string;
  summary: string;
  timestamp: string;
  runId?: string;
  tab?: WorkspaceTabId;
  severity?: "neutral" | "success" | "warning" | "danger";
};

export type CurrentWork = {
  primaryRunId?: string;
  relatedRunIds: string[];
  gateId?: string;
  status: AgentRunStatus;
  summary: string;
};

export type AgentRunGroup = {
  id: AgentGroupId;
  label: string;
  status: AgentRunStatus;
  runIds: string[];
  failedCount: number;
  active: boolean;
};

export type GateOption = {
  id: string;
  label: string;
  tone: "primary" | "secondary" | "danger";
};

export type OpenGate = {
  id: string;
  type: string;
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
  command: string;
  options: GateOption[];
};

export type SwimlaneCell = {
  agentId: string;
  step: AgentStepName;
  summary: string;
  fullSummary?: string;
  status: AgentRunStatus;
  runId?: string;
  chips?: string[];
  links?: WorkspaceTabId[];
  firstSeq?: number;
  lastSeq?: number;
};

export type SwimlaneRow = {
  id: string;
  groupId: AgentGroupId;
  agentName: string;
  role: string;
  status: AgentRunStatus;
  cells: SwimlaneCell[];
};

export type TestRow = {
  name: string;
  detail: string;
  status: "passed" | "failed" | "pending";
  linkedRunId?: string;
};

export type UiV2Projection = {
  source: "fixture" | "live";
  project: {
    name: string;
    slug: string;
    status: string;
    pausedFrom?: string;
    activeGroup: string;
    progress: string;
  };
  composer: {
    mode: UiV2ComposerMode;
    reason: string;
    disabled: boolean;
    readOnly: boolean;
  };
  orchestration: {
    orchestratorStatus: AgentRunStatus;
    activeGroup: string;
    activeAgent: string;
    unit: string;
    phase: AgentStepName | "Gate";
    blocker: string;
    nextAction: string;
  };
  requirementSnapshot: {
    raw: string;
    normalized: string;
    score: number;
    facts: string[];
    upcoming: string[];
  };
  groups: AgentGroup[];
  runs: AgentRun[];
  currentWork: CurrentWork;
  runGroups: AgentRunGroup[];
  streamItems: StreamItem[];
  swimlaneRows: SwimlaneRow[];
  openGate?: OpenGate;
  tests: TestRow[];
  files: Array<{ path: string; status: "changed" | "created" | "artifact" }>;
  previewUrl?: string;
  terminalItems: Array<{ title: string; summary: string }>;
  reportArtifacts: string[];
};
