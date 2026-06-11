import type { RequirementFixtureProfile } from "@oc/agent-core";
import {
  resumeRequirementAfterGate,
  skipRequirementClarification,
  startRequirement,
  submitRequirementAnswers,
  type RequirementRunResult,
} from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import { createRequirementDeps, type RequirementServiceContext } from "./deps.js";

export function createRequirementService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  workspace: WorkspaceService,
  onEvent: (envelope: EventEnvelope) => void,
) {
  const ctx: RequirementServiceContext = { db, projects, gates, workspace, onEvent };

  return {
    async start(
      projectId: string,
      requirement: string,
      profile?: RequirementFixtureProfile,
    ): Promise<RequirementRunResult> {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const deps = createRequirementDeps(ctx, { profile });
      return startRequirement(deps, { projectId, requirement, profile });
    },

    async submitAnswers(
      projectId: string,
      answers: string[],
    ): Promise<RequirementRunResult> {
      const deps = createRequirementDeps(ctx);
      return submitRequirementAnswers(deps, { projectId, answers });
    },

    async skipClarification(projectId: string): Promise<RequirementRunResult> {
      const deps = createRequirementDeps(ctx);
      return skipRequirementClarification(deps, { projectId });
    },

    async resumeAfterGate(
      projectId: string,
      decision: string,
    ): Promise<RequirementRunResult> {
      const deps = createRequirementDeps(ctx);
      return resumeRequirementAfterGate(deps, { projectId, decision });
    },
  };
}

export type RequirementService = ReturnType<typeof createRequirementService>;
