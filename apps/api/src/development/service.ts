import { registerDevelopmentAgents, type DevFixtureProfile } from "@oc/agent-core";
import {
  getDevelopmentStatus,
  resumeDevelopmentAfterGate,
  startDevelopment,
  type DevelopmentRunResult,
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
      const paths = workspace.ensureForProject(project);
      const deps = createDevelopmentDeps(ctx, projectId, { profile });
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
      const deps = createDevelopmentDeps(ctx, projectId);
      return resumeDevelopmentAfterGate(deps, { projectId, decision });
    },

    getStatus(projectId: string): DevelopmentRunResult {
      const deps = createDevelopmentDeps(ctx, projectId);
      return getDevelopmentStatus(deps, projectId);
    },
  };
}

export type DevelopmentService = ReturnType<typeof createDevelopmentService>;
