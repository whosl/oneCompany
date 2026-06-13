import type { DevAgentTask, DevFixtureProfile, RunAgentInput, RunAgentResult } from "@oc/agent-core";
import type {
  AuthDecision,
  CodingHarness,
  DevContext,
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
import { normalizeSliceTestCommand } from "@oc/workspace";

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

export type DeploymentSessionMeta = {
  phase: "idle" | "awaiting_gate" | "completed";
  gateId?: string;
  pendingUrl?: string;
};

export type DeliverySessionMeta = {
  phase: "idle" | "awaiting_final_acceptance" | "completed";
  gateId?: string;
  reportGenerated?: boolean;
};

export type DevelopmentSessionMeta = {
  phase: DevelopmentWorkflowPhase;
  profile: DevFixtureProfile;
  gateId?: string;
  gateType?: DevelopmentGateType;
  currentSliceId?: string;
  pendingChangeRequestId?: string;
  pendingChangeRequestKind?: "skip_slice" | "requirement_change";
  sliceRetryBudgetExtension?: number;
};

export type DevelopmentSessionPayload = {
  state: DevState;
  meta: DevelopmentSessionMeta;
  testing?: TestingSessionMeta;
  deployment?: DeploymentSessionMeta;
  delivery?: DeliverySessionMeta;
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
  /**
   * Optional whole-repo typecheck run after a slice's tests pass and before
   * its commit. Catches build-breaking type errors at the slice boundary
   * instead of at the final Testing phase (where fixing means another full
   * Developing round-trip).
   */
  runSliceTypecheck?: () => Promise<{ passed: boolean; details: string }>;
  repoPath: string;
  logsPath?: string;
  runGovernedCommand?: DevContext["runGovernedCommand"];
  classifyShellRisk?: DevContext["classifyShellRisk"];
};

export type DevelopmentRunResult = {
  phase: DevelopmentWorkflowPhase;
  projectStatus: ProjectStatus;
  gateId?: string;
  gateType?: DevelopmentGateType;
  gateOptions?: string[];
  state: DevState;
  /** True when the slice loop is executing in a background task. */
  running?: boolean;
  /** Last background slice-loop error, if any. */
  backgroundError?: string;
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

export function buildSliceSpec(
  slice: FunctionSliceTask,
  state: DevState,
  repoPath?: string,
): SliceSpec {
  const testCommand = repoPath
    ? normalizeSliceTestCommand(repoPath, slice.testCommand, slice.id)
    : slice.testCommand;
  return {
    projectId: state.projectId,
    sliceId: slice.id,
    goal: slice.title,
    acceptanceChecks: slice.acceptanceChecks ?? [],
    testCommand,
    expectedFiles: slice.expectedFiles,
    modelTier: "strong",
  };
}

export type { SliceSpec };
