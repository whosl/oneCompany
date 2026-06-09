import type { Db, EventEnvelope, ProjectStatus } from "@oc/shared";
import type { DevelopmentSessionPayload } from "../development/types.js";

export type DeploymentWorkflowDeps = {
  db: Db;
  onEvent?: (envelope: EventEnvelope) => void;
  createGate: (projectId: string, gateType: "deployment") => { id: string };
  setStatus: (projectId: string, status: ProjectStatus, trigger: string) => void;
  getProjectStatus: (projectId: string) => ProjectStatus;
  loadSession: (projectId: string) => DevelopmentSessionPayload;
  saveSession: (projectId: string, payload: DevelopmentSessionPayload) => void;
  onDeploymentCompleted?: (projectId: string) => Promise<void> | void;
};

export type DeploymentRunResult = {
  phase: "idle" | "awaiting_gate" | "completed";
  projectStatus: ProjectStatus;
  gateId?: string;
  deploymentUrl?: string;
};
