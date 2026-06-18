import {
  getDeploymentStatus,
  handleDeploymentGateDecision,
  loadDevSession,
  saveDevSession,
  startDeploymentPhase,
  startRequirementChangeReview,
  submitDeploymentUrl,
  type DeploymentRunResult,
} from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import { createDevelopmentDeps } from "../development/deps.js";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import type { DeliveryService } from "../delivery/service.js";

export function createDeploymentService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  workspace: WorkspaceService,
  delivery: DeliveryService,
  onEvent: (envelope: EventEnvelope) => void,
) {
  const buildDeps = (projectId: string) => {
    const project = projects.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return {
      db,
      onEvent,
      createGate: (pid: string, gateType: "deployment") => {
        const gate = gates.createGate(pid, gateType);
        return { id: gate.id };
      },
      setStatus: (pid: string, status: Parameters<ProjectService["setStatus"]>[1], trigger: string) =>
        projects.setStatus(pid, status, trigger),
      getProjectStatus: (pid: string) => {
        const row = projects.getProject(pid);
        if (!row) {
          throw new Error(`Project not found: ${pid}`);
        }
        return row.status;
      },
      loadSession: (pid: string) => loadDevSession(db, pid),
      saveSession: (pid: string, payload: ReturnType<typeof loadDevSession>) =>
        saveDevSession(db, pid, payload),
      onDeploymentCompleted: async (pid: string) => {
        await delivery.enterAwaitingAcceptance(pid);
      },
      startChangeReview: (
        pid: string,
        input: { summary: string; details?: string },
      ) => {
        startRequirementChangeReview(
          createDevelopmentDeps({ db, projects, gates, workspace, onEvent }, pid),
          { projectId: pid, ...input },
        );
      },
    };
  };

  return {
    start(projectId: string): DeploymentRunResult {
      return startDeploymentPhase(buildDeps(projectId), { projectId });
    },

    submitUrl(projectId: string, url: string): DeploymentRunResult {
      return submitDeploymentUrl(buildDeps(projectId), { projectId, url });
    },

    async resumeAfterGate(projectId: string, decision: string): Promise<DeploymentRunResult> {
      return handleDeploymentGateDecision(buildDeps(projectId), { projectId, decision });
    },

    getStatus(projectId: string): DeploymentRunResult {
      return getDeploymentStatus(buildDeps(projectId), projectId);
    },
  };
}

export type DeploymentService = ReturnType<typeof createDeploymentService>;
