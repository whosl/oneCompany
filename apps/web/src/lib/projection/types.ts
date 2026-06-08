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

export type ConsoleProjection = {
  snapshot: ConsoleSnapshot;
  events: EventEnvelope[];
  openGates: ConsoleSnapshot["openGates"];
  blockingGateId?: string;
  agents: Record<string, AgentProjection>;
  streamItems: StreamItem[];
  swimlane: SwimlaneCell[];
  lastSeq: number;
};
