import type { DevAgentTask, RunAgentInput, RunAgentResult } from "@oc/agent-core";
import type {
  DevState,
  EventEnvelope,
  FinalSuiteId,
  NormalizedRunnerResult,
  ProjectStatus,
  TestingSessionMeta,
} from "@oc/shared";
import type { CallIntegrationToolDeps } from "@oc/integrations";
import type { IntegrationVerificationArtifact } from "@oc/shared";
import type { PreviewHandle } from "@oc/workspace";
import type { DevelopmentSessionPayload } from "../development/types.js";
import type { IntegrationVerificationSummary } from "../integrations/hooks.js";

export type TestingWorkflowPhase = TestingSessionMeta["phase"];

export type TestingWorkflowDeps = {
  db: import("@oc/shared").Db;
  onEvent?: (envelope: EventEnvelope) => void;
  repoPath: string;
  artifactsPath?: string;
  skillPacksRoot?: string;
  callIntegration?: CallIntegrationToolDeps;
  setStatus: (projectId: string, status: ProjectStatus, trigger: string) => void;
  getProjectStatus: (projectId: string) => ProjectStatus;
  loadSession: (projectId: string) => DevelopmentSessionPayload;
  saveSession: (projectId: string, payload: DevelopmentSessionPayload) => void;
  startPreview: (projectId: string) => Promise<PreviewHandle>;
  stopPreview: (projectId: string) => Promise<void>;
  runSuite: (
    suite: FinalSuiteId,
    previewUrl?: string,
  ) => Promise<NormalizedRunnerResult>;
  runAgent: (input: RunAgentInput & { task: DevAgentTask }) => Promise<RunAgentResult>;
  runPreviewIntegrationChecks?: (
    previewUrl: string,
    label: "baseline" | "diagnostic",
    enabledIntegrationIds?: string[],
  ) => Promise<IntegrationVerificationSummary | undefined>;
  loadRequirementIntegrations?: (projectId: string) => string[];
};

export type TestingRunResult = {
  phase: TestingWorkflowPhase;
  projectStatus: ProjectStatus;
  previewUrl?: string;
  suiteResults: NormalizedRunnerResult[];
  state: DevState;
  qaNotes?: string[];
  integrationArtifacts?: IntegrationVerificationArtifact[];
};

export const FINAL_SUITE_ORDER: FinalSuiteId[] = [
  "final:typecheck",
  "final:build",
  "final:vitest",
  "final:playwright",
];
