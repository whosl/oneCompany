import {
  enterAwaitingAcceptance,
  exportSubmissionPackage,
  generateDeliveryReport,
  getFinalAcceptanceStatus,
  handleFinalAcceptanceDecision,
  loadDevSession,
  saveDevSession,
  type FinalAcceptanceResult,
} from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function createDeliveryService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  workspace: WorkspaceService,
  onEvent: (envelope: EventEnvelope) => void,
) {
  const buildDeps = (projectId: string) => {
    const project = projects.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const paths = workspace.ensureForProject(project);

    return {
      db,
      onEvent,
      createGate: (pid: string, gateType: "final_acceptance") => {
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
      paths,
    };
  };

  const reportInput = (projectId: string) => {
    const deps = buildDeps(projectId);
    const payload = deps.loadSession(projectId);
    return {
      projectId,
      repoPath: deps.paths.repo,
      artifactsPath: deps.paths.artifacts,
      previewUrl: payload.state.previewUrl,
      deploymentUrl: payload.state.deploymentUrl,
      stateRisks: payload.state.risks,
      taskTitles: payload.state.taskQueue.map((task) => task.title),
    };
  };

  return {
    async enterAwaitingAcceptance(projectId: string): Promise<FinalAcceptanceResult> {
      return enterAwaitingAcceptance(buildDeps(projectId), reportInput(projectId));
    },

    generateReport(projectId: string) {
      const deps = buildDeps(projectId);
      const status = deps.getProjectStatus(projectId);
      return generateDeliveryReport(deps, {
        ...reportInput(projectId),
        projectStatus: status,
      });
    },

    resumeFinalAcceptance(projectId: string, decision: string): FinalAcceptanceResult {
      return handleFinalAcceptanceDecision(buildDeps(projectId), { projectId, decision });
    },

    getStatus(projectId: string): FinalAcceptanceResult {
      return getFinalAcceptanceStatus(buildDeps(projectId), projectId);
    },

    exportSubmission(projectId: string) {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const paths = workspace.ensureForProject(project);
      return exportSubmissionPackage(db, {
        projectId,
        projectName: project.name,
        repoPath: paths.repo,
        artifactsPath: paths.artifacts,
      });
    },
  };
}

export type DeliveryService = ReturnType<typeof createDeliveryService>;
