import {
  createRequirementRunner,
  registerRequirementAgents,
  resolveEngineMode,
  runAgent,
  type RequirementAgentTask,
  type RequirementFixtureProfile,
} from "@oc/agent-core";
import { createAuthorize } from "@oc/workspace";
import type { RequirementWorkflowDeps } from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { ToolOp } from "@oc/agent-core";
import type { AuthDecision } from "@oc/agent-core";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export type RequirementServiceContext = {
  db: Db;
  projects: ProjectService;
  gates: GateService;
  workspace: WorkspaceService;
  onEvent: (envelope: EventEnvelope) => void;
};

export function createRequirementAuthorize(
  ctx: RequirementServiceContext,
  projectId: string,
  mode: ReturnType<typeof resolveEngineMode>,
): (op: ToolOp) => Promise<AuthDecision> {
  if (mode === "stub") {
    return async () => ({ allow: true as const });
  }

  const project = ctx.projects.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const paths = ctx.workspace.ensureForProject(project);
  return createAuthorize(projectId, {
    repoPath: paths.repo,
    createGate: (pid, gateType, metadata) => ctx.gates.createGate(pid, gateType, metadata),
    waitForGate: (gateId) => ctx.gates.waitForGate(gateId),
  });
}

export function createRequirementDeps(
  ctx: RequirementServiceContext,
  options: { profile?: RequirementFixtureProfile } = {},
): RequirementWorkflowDeps {
  registerRequirementAgents(ctx.db);
  const mode = resolveEngineMode();

  return {
    db: ctx.db,
    onEvent: ctx.onEvent,
    runAgent: async (input) => {
      const project = ctx.projects.getProject(input.projectId);
      if (!project) {
        throw new Error(`Project not found: ${input.projectId}`);
      }
      const paths = ctx.workspace.ensureForProject(project);
      return runAgent(
        {
          db: ctx.db,
          onEvent: ctx.onEvent,
          authorize: createRequirementAuthorize(ctx, input.projectId, mode),
          repoPath: paths.repo,
          runner: createRequirementRunner(ctx.db, {
            mode,
            requirementProfile: options.profile,
          }),
        },
        { ...input, task: input.task as RequirementAgentTask },
      );
    },
    createGate: (projectId, gateType) => {
      const gate = ctx.gates.createGate(projectId, gateType);
      return { id: gate.id };
    },
    setStatus: (projectId, status, trigger) => {
      ctx.projects.setStatus(projectId, status, trigger);
    },
    getProjectStatus: (projectId) => {
      const project = ctx.projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      return project.status;
    },
  };
}
