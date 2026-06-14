import { registerDevelopmentAgents, type DevFixtureProfile } from "@oc/agent-core";
import {
  getDevelopmentStatus,
  resumeDevelopmentAfterGate,
  startFinalRepair as startFinalRepairWorkflow,
  startDevelopment,
  type StartFinalRepairInput,
  type DevelopmentRunResult,
  type DevelopmentWorkflowDeps,
} from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import { createDevelopmentDeps, type DevelopmentServiceContext } from "./deps.js";

export function createDevelopmentService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  workspace: WorkspaceService,
  onEvent: (envelope: EventEnvelope) => void,
  options: {
    onFinalRepairCompleted?: DevelopmentWorkflowDeps["onFinalRepairCompleted"];
  } = {},
) {
  registerDevelopmentAgents(db);

  const ctx: DevelopmentServiceContext = { db, projects, gates, workspace, onEvent };

  return {
    async start(
      projectId: string,
      profile?: DevFixtureProfile,
    ): Promise<DevelopmentRunResult> {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const requirementGate = gates
        .listOpenGates(projectId)
        .find((gate) => gate.gateType === "requirement_confirm");
      if (requirementGate) {
        throw new Error("Requirement confirmation gate must be approved before development");
      }
      const paths = workspace.ensureForProject(project);
      const deps = createDevelopmentDeps(ctx, projectId, {
        profile,
        onFinalRepairCompleted: options.onFinalRepairCompleted,
      });
      return startDevelopment(deps, {
        projectId,
        repoPath: paths.repo,
        worktreePath: paths.repo,
        profile,
      });
    },

    async resumeAfterGate(
      projectId: string,
      decision: string,
    ): Promise<DevelopmentRunResult> {
      const deps = createDevelopmentDeps(ctx, projectId, {
        onFinalRepairCompleted: options.onFinalRepairCompleted,
      });
      return resumeDevelopmentAfterGate(deps, { projectId, decision });
    },

    startFinalRepair(input: StartFinalRepairInput): DevelopmentRunResult {
      const deps = createDevelopmentDeps(ctx, input.projectId, {
        onFinalRepairCompleted: options.onFinalRepairCompleted,
      });
      return startFinalRepairWorkflow(deps, input);
    },

    getStatus(projectId: string): DevelopmentRunResult {
      const deps = createDevelopmentDeps(ctx, projectId, {
        onFinalRepairCompleted: options.onFinalRepairCompleted,
      });
      return getDevelopmentStatus(deps, projectId);
    },
  };
}

export type DevelopmentService = ReturnType<typeof createDevelopmentService>;
