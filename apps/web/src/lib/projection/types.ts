import type {
  ConsoleSnapshot,
  EventEnvelope,
  StreamItem,
  SwimlaneCell,
} from "@oc/shared";

export type AgentProjection = {
  agentId: string;
  latestPlan?: string;
  latestAct?: string;
  latestObserve?: string;
  latestReflect?: string;
  failed?: boolean;
  activeRunId?: string;
};

export type ParorSegment = {
  id: string;
  phase: "plan" | "act" | "observe" | "reflect";
  summary: string;
  status: "active" | "completed" | "failed";
  expanded: boolean;
};

export type StreamRunGroup = {
  id: string;
  runId: string;
  agentId?: string;
  items: StreamItem[];
  segments: ParorSegment[];
  collapsed: boolean;
};

export type ConsoleProjection = {
  snapshot: ConsoleSnapshot;
  events: EventEnvelope[];
  openGates: ConsoleSnapshot["openGates"];
  blockingGateId?: string;
  composer: ComposerProjection;
  timeline: StreamItem[];
  agents: Record<string, AgentProjection>;
  streamItems: StreamItem[];
  streamGroups: StreamRunGroup[];
  ungroupedStreamItems: StreamItem[];
  swimlane: SwimlaneCell[];
  lastSeq: number;
};

export type ComposerMode =
  | "requirement"
  | "question_round"
  | "gate_decision"
  | "change_request"
  | "deployment_url"
  | "read_only"
  | "paused";

export type ComposerProjection = {
  mode: ComposerMode;
  blockingGateId?: string;
  disabled: boolean;
  readOnly: boolean;
  reason: string;
};
