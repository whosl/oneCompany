import type { ConsoleProjection } from "@/lib/projection/types";
import type { AgentRun, AgentRunStatus, OpenGate, UiV2Projection } from "../ui-v2/types";
import type { LifecycleStepId } from "./constants";

export type UiV3ContextualAction = {
  id: string;
  label: string;
  description: string;
  variant: "primary" | "secondary" | "danger";
  disabled?: boolean;
  disabledReason?: string;
};

export type UiV3AgentState = {
  id: string;
  name: string;
  group: "requirement" | "development";
  role: string;
  tier?: string;
  status: AgentRunStatus;
  latestSummary?: string;
  runCount: number;
  lastRunId?: string;
};

export type UiV3LifecycleState = {
  currentStepId: LifecycleStepId | "failed" | "paused";
  stepIndex: number;
  label: string;
  isTerminal: boolean;
};

export type UiV3PendingQuestion = {
  index: number;
  question: string;
  suggestedAnswers: string[];
};

export type UiV3GateView = OpenGate & {
  isBlocking: boolean;
};

export type UiV3Projection = {
  base: UiV2Projection;
  lifecycle: UiV3LifecycleState;
  agentStates: UiV3AgentState[];
  openGates: UiV3GateView[];
  blockingGate?: UiV3GateView;
  contextualActions: UiV3ContextualAction[];
  pendingQuestions: UiV3PendingQuestion[];
  sliceProgress?: { current: number; total: number; sliceId?: string };
  devPreviewUrl?: string;
  testingPreviewUrl?: string;
  rawProjection: ConsoleProjection;
};

export type UiV3ConsoleMode = "timeline" | "swimlane" | "agents";

export type UiV3Actions = {
  onRefresh: () => Promise<void>;
  onPauseResume: () => Promise<void>;
  onDeploy: () => Promise<void>;
  onStartDevelopment: () => Promise<void>;
  onResolveGate: (gateId: string, decision: string, customText?: string) => Promise<void>;
  onComposerSubmit: (
    mode: UiV2Projection["composer"]["mode"],
    text: string,
    answers?: string[],
  ) => Promise<void>;
  onSkipClarification?: () => Promise<void>;
  onContextualAction: (actionId: string) => Promise<void>;
  onOpenProjectHub: () => void;
  onOpenSettings: () => void;
};

export type { AgentRun, AgentRunStatus };
