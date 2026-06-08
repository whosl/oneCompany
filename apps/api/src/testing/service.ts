import {
  registerDevelopmentAgents,
  runAgent,
  runScriptedDevAgent,
  type DevAgentTask,
} from "@oc/agent-core";
import type { Db, EventEnvelope, FinalSuiteId } from "@oc/shared";
import {
  getTestingStatus,
  loadDevSession,
  runTestingPhase,
  saveDevSession,
  type TestingRunResult,
  type TestingWorkflowDeps,
} from "@oc/workflow";
import {
  getPreviewHealth,
  runSuite,
  startPreview,
  stopPreview,
  type RunnerDeps,
} from "@oc/workspace";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function createTestingService(
  db: Db,
  projects: ProjectService,
  workspace: WorkspaceService,
  onEvent: (envelope: EventEnvelope) => void,
) {
  registerDevelopmentAgents(db);

  const buildDeps = (projectId: string): TestingWorkflowDeps => {
    const project = projects.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const paths = workspace.ensureForProject(project);
    const shellDeps = workspace.createShellDeps(project);
    const runnerDeps: RunnerDeps = { shell: shellDeps, repoPath: paths.repo };

    return {
      db,
      onEvent,
      repoPath: paths.repo,
      loadSession: (pid) => loadDevSession(db, pid),
      saveSession: (pid, payload) => saveDevSession(db, pid, payload),
      startPreview: async (pid) => startPreview({ projectId: pid }),
      stopPreview: async (pid) => stopPreview(pid),
      runSuite: async (suite: FinalSuiteId, previewUrl?: string) => {
        if (process.env.OC_TESTING_FIXTURE === "1") {
          return { suite, status: "passed", details: "api-testing-fixture" };
        }
        return runSuite(runnerDeps, {
          suite,
          command: defaultCommandForSuite(suite),
          previewUrl,
        });
      },
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
      setStatus: (pid, status, trigger) => projects.setStatus(pid, status, trigger),
      getProjectStatus: (pid) => {
        const row = projects.getProject(pid);
        if (!row) {
          throw new Error(`Project not found: ${pid}`);
        }
        return row.status;
      },
    };
  };

  return {
    async start(
      projectId: string,
      options: { requestDeploy?: boolean } = {},
    ): Promise<TestingRunResult> {
      return runTestingPhase(buildDeps(projectId), { projectId, ...options });
    },

    getStatus(projectId: string): TestingRunResult {
      return getTestingStatus(buildDeps(projectId), projectId);
    },

    async startPreview(projectId: string): Promise<{ url: string; health: { reachable: boolean } }> {
      const deps = buildDeps(projectId);
      const handle = await deps.startPreview(projectId);
      const payload = deps.loadSession(projectId);
      deps.saveSession(projectId, {
        ...payload,
        state: { ...payload.state, previewUrl: handle.url },
        testing: {
          ...(payload.testing ?? { phase: "idle", suiteResults: [] }),
          previewUrl: handle.url,
        },
      });
      const health = await getPreviewHealth(handle.url);
      return { url: handle.url, health: { reachable: health.reachable } };
    },

    async stopPreview(projectId: string): Promise<void> {
      await stopPreview(projectId);
    },
  };
}

function defaultCommandForSuite(suite: FinalSuiteId): string {
  switch (suite) {
    case "final:typecheck":
      return "pnpm typecheck";
    case "final:build":
      return "pnpm build";
    case "final:vitest":
      return "pnpm vitest run --reporter=json";
    case "final:playwright":
      return "pnpm exec playwright test --reporter=json";
    default:
      return "echo unknown-suite";
  }
}

export type TestingService = ReturnType<typeof createTestingService>;
