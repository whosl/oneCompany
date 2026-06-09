import type { DevAgentTask, DevFixtureProfile, RunAgentInput, RunAgentResult } from "@oc/agent-core";
import type {
  AuthDecision,
  CodingHarness,
  DevContext,
  SliceResult,
  SliceSpec,
  ToolOp,
} from "@oc/agent-core";
import type {
  DevState,
  EventEnvelope,
  FunctionSliceTask,
  ProjectStatus,
  TestingSessionMeta,
} from "@oc/shared";

export type DevelopmentWorkflowPhase =
  | "idle"
  | "tech_plan"
  | "planning"
  | "slicing"
  | "awaiting_gate"
  | "change_review"
  | "completed"
  | "failed";

export type DevelopmentGateType = "tech_plan_confirm" | "slice_failure" | "change_review";

export type DevelopmentSessionMeta = {
  phase: DevelopmentWorkflowPhase;
  profile: DevFixtureProfile;
  gateId?: string;
  gateType?: DevelopmentGateType;
  currentSliceId?: string;
  pendingChangeRequestId?: string;
  sliceRetryBudgetExtension?: number;
};

export type DevelopmentSessionPayload = {
  state: DevState;
  meta: DevelopmentSessionMeta;
  testing?: TestingSessionMeta;
};

export type AuthoritativeCheckResult = {
  passed: boolean;
  details: string;
};

export type DevelopmentWorkflowDeps = {
  db: import("@oc/shared").Db;
  onEvent?: (envelope: EventEnvelope) => void;
  runAgent: (input: RunAgentInput & { task: DevAgentTask }) => Promise<RunAgentResult>;
  createGate: (projectId: string, gateType: string) => { id: string };
  setStatus: (projectId: string, status: ProjectStatus, trigger: string) => void;
  getProjectStatus: (projectId: string) => ProjectStatus;
  harness: CodingHarness;
  authorize: (op: ToolOp) => Promise<AuthDecision>;
  runAuthoritativeCheck: (
    slice: FunctionSliceTask,
    attempt: number,
  ) => Promise<AuthoritativeCheckResult>;
  repoPath: string;
  logsPath?: string;
};

export type DevelopmentRunResult = {
  phase: DevelopmentWorkflowPhase;
  projectStatus: ProjectStatus;
  gateId?: string;
  gateType?: DevelopmentGateType;
  gateOptions?: string[];
  state: DevState;
};

export type SliceIterationResult =
  | { kind: "passed"; state: DevState }
  | { kind: "retry"; state: DevState }
  | { kind: "gate"; state: DevState; gateId: string };

export const TECH_PLAN_CONFIRM_GATE = "tech_plan_confirm";
export const SLICE_FAILURE_GATE = "slice_failure";
export const CHANGE_REVIEW_GATE = "change_review";

export const SLICE_RETRY_BUDGET_EXTENSION = 4;

export type HarnessContextFactory = (
  deps: DevelopmentWorkflowDeps,
  state: DevState,
) => DevContext;

export function buildSliceSpec(slice: FunctionSliceTask, state: DevState): SliceSpec {
  return {
    projectId: state.projectId,
    sliceId: slice.id,
    goal: slice.title,
    acceptanceChecks: slice.acceptanceChecks ?? [],
    testCommand: slice.testCommand,
    modelTier: "strong",
  };
}

export type { SliceSpec };
