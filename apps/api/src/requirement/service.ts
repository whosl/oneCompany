import {
  registerRequirementAgents,
  runAgent,
  runScriptedRequirementAgent,
  type RequirementAgentTask,
  type RequirementFixtureProfile,
} from "@oc/agent-core";
import {
  resumeRequirementAfterGate,
  startRequirement,
  submitRequirementAnswers,
  type RequirementRunResult,
  type RequirementWorkflowDeps,
} from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";

export function createRequirementService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  onEvent: (envelope: EventEnvelope) => void,
) {
  registerRequirementAgents(db);

  const deps: RequirementWorkflowDeps = {
    db,
    onEvent,
    runAgent: async (input) =>
      runAgent(
        {
          db,
          onEvent,
          runner: async (agentIdAtVersion, task) => ({
            output: runScriptedRequirementAgent(
              agentIdAtVersion,
              task as RequirementAgentTask,
            ),
          }),
        },
        input,
      ),
    createGate: (projectId, gateType, options) => {
      const gate = gates.createGate(projectId, gateType, options);
      return { id: gate.id };
    },
    setStatus: (projectId, status, trigger) => {
      projects.setStatus(projectId, status, trigger);
    },
    getProjectStatus: (projectId) => {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      return project.status;
    },
  };

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
      return startRequirement(deps, { projectId, requirement, profile });
    },

    async submitAnswers(
      projectId: string,
      answers: string[],
    ): Promise<RequirementRunResult> {
      return submitRequirementAnswers(deps, { projectId, answers });
    },

    async resumeAfterGate(
      projectId: string,
      decision: string,
    ): Promise<RequirementRunResult> {
      return resumeRequirementAfterGate(deps, { projectId, decision });
    },
  };
}

export type RequirementService = ReturnType<typeof createRequirementService>;
