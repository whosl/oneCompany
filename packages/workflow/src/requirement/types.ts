import type { RequirementFixtureProfile } from "@oc/agent-core";
import type { EventEnvelope, ProjectStatus, RequirementState } from "@oc/shared";
import type { RunAgentInput, RunAgentResult } from "@oc/agent-core";
import type { RequirementAgentTask } from "@oc/agent-core";

export type RequirementWorkflowPhase =
  | "running"
  | "awaiting_answers"
  | "awaiting_gate"
  | "completed"
  | "failed";

export type RequirementSessionMeta = {
  phase: RequirementWorkflowPhase;
  profile: RequirementFixtureProfile;
  gateId?: string;
};

export type RequirementSessionPayload = {
  state: RequirementState;
  meta: RequirementSessionMeta;
};

export type RequirementWorkflowDeps = {
  db: import("@oc/shared").Db;
  onEvent?: (envelope: EventEnvelope) => void;
  runAgent: (
    input: RunAgentInput & { task: RequirementAgentTask },
  ) => Promise<RunAgentResult>;
  createGate: (projectId: string, gateType: string) => { id: string };
  setStatus: (projectId: string, status: ProjectStatus, trigger: string) => void;
  getProjectStatus: (projectId: string) => ProjectStatus;
};

export type RequirementRunResult = {
  phase: RequirementWorkflowPhase;
  projectStatus: ProjectStatus;
  questions?: string[];
  gateId?: string;
  gateOptions?: string[];
  state: RequirementState;
};

export const REQUIREMENT_STUCK_GATE_TYPE = "requirement_stuck";
export const REQUIREMENT_STUCK_OPTIONS = [
  "keep_answering",
  "force_continue",
  "fail",
] as const;
export const STUCK_BUDGET_EXTENSION = 3;
