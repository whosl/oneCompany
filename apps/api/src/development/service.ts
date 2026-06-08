import {
  registerDevelopmentAgents,
  runAgent,
  runScriptedDevAgent,
  StubHarness,
  type DevAgentTask,
  type DevFixtureProfile,
} from "@oc/agent-core";
import {
  getDevelopmentStatus,
  resumeDevelopmentAfterGate,
  startDevelopment,
  type DevelopmentRunResult,
  type DevelopmentWorkflowDeps,
} from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function createDevelopmentService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  workspace: WorkspaceService,
  onEvent: (envelope: EventEnvelope) => void,
) {
  registerDevelopmentAgents(db);

  const buildDeps = (projectId: string, repoPath: string): DevelopmentWorkflowDeps => ({
    db,
    onEvent,
    repoPath,
    harness: StubHarness,
    authorize: async () => ({ allow: true }),
    runAuthoritativeCheck: async () => ({
      passed: true,
      details: "api-default-pass",
    }),
    runAgent: async (input) =>
      runAgent(
        {
          db,
          onEvent,
          runner: async (agentIdAtVersion, task) => ({
            output: runScriptedDevAgent(agentIdAtVersion, task as DevAgentTask),
          }),
        },
        input,
      ),
    createGate: (pid, gateType) => {
      const gate = gates.createGate(pid, gateType);
      return { id: gate.id };
    },
    setStatus: (pid, status, trigger) => {
      projects.setStatus(pid, status, trigger);
    },
    getProjectStatus: (pid) => {
      const project = projects.getProject(pid);
      if (!project) {
        throw new Error(`Project not found: ${pid}`);
      }
      return project.status;
    },
  });

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
      const deps = buildDeps(projectId, paths.repo);
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
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const paths = workspace.ensureForProject(project);
      const deps = buildDeps(projectId, paths.repo);
      return resumeDevelopmentAfterGate(deps, { projectId, decision });
    },

    getStatus(projectId: string): DevelopmentRunResult {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const paths = workspace.ensureForProject(project);
      const deps = buildDeps(projectId, paths.repo);
      return getDevelopmentStatus(deps, projectId);
    },
  };
}

export type DevelopmentService = ReturnType<typeof createDevelopmentService>;
