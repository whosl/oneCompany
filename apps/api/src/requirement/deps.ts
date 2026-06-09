import {
  createRequirementRunner,
  registerRequirementAgents,
  resolveEngineMode,
  runAgent,
  type RequirementAgentTask,
  type RequirementFixtureProfile,
} from "@oc/agent-core";
import type { RequirementWorkflowDeps } from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";

export type RequirementServiceContext = {
  db: Db;
  projects: ProjectService;
  gates: GateService;
  onEvent: (envelope: EventEnvelope) => void;
};

export function createRequirementDeps(
  ctx: RequirementServiceContext,
  options: { profile?: RequirementFixtureProfile } = {},
): RequirementWorkflowDeps {
  registerRequirementAgents(ctx.db);
  const mode = resolveEngineMode();

  return {
    db: ctx.db,
    onEvent: ctx.onEvent,
    runAgent: async (input) =>
      runAgent(
        {
          db: ctx.db,
          onEvent: ctx.onEvent,
          authorize: async () => ({ allow: true as const }),
          runner: createRequirementRunner(ctx.db, {
            mode,
            requirementProfile: options.profile,
          }),
        },
        { ...input, task: input.task as RequirementAgentTask },
      ),
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
