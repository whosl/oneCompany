import {
  createDevelopmentRunner,
  registerDevelopmentAgents,
  resolveEngineMode,
  runAgent,
  type DevAgentTask,
} from "@oc/agent-core";
import { assertTestingFixtureAllowed, type Db, type EventEnvelope, type FinalSuiteId } from "@oc/shared";
import {
  applyRequirementIntegrations,
  getTestingStatus,
  loadDevSession,
  loadRequirementSession,
  runPreviewIntegrationChecks,
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
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GateService } from "../gates/service.js";
import { createCallIntegrationToolDeps } from "../integrations/deps-factory.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import type { DeploymentService } from "../deployment/service.js";
import type { DeliveryService } from "../delivery/service.js";
import type { DevelopmentService } from "../development/service.js";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const DEFAULT_SKILL_PACKS_ROOT = path.join(REPO_ROOT, "skill-packs");

export function createTestingService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  workspace: WorkspaceService,
  development: DevelopmentService,
  deployment: DeploymentService,
  delivery: DeliveryService,
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
    const integrationChecksEnabled =
      process.env.OC_TESTING_INTEGRATION_CHECKS !== "0" &&
      process.env.OC_TESTING_FIXTURE !== "1";

    const callIntegration = integrationChecksEnabled
      ? createCallIntegrationToolDeps({
          db,
          projectId,
          artifactsPath: paths.artifacts,
          skillPacksRoot: DEFAULT_SKILL_PACKS_ROOT,
          onEvent,
          gates,
          caller: "workflow",
        })
      : undefined;

    return {
      db,
      onEvent,
      repoPath: paths.repo,
      artifactsPath: paths.artifacts,
      skillPacksRoot: DEFAULT_SKILL_PACKS_ROOT,
      callIntegration,
      loadSession: (pid) => loadDevSession(db, pid),
      saveSession: (pid, payload) => saveDevSession(db, pid, payload),
      startPreview: async (pid) => {
        const session = loadDevSession(db, pid);
        return startPreview({ projectId: pid, repoPath: session.state.repoPath });
      },
      stopPreview: async (pid) => stopPreview(pid),
      runSuite: async (suite: FinalSuiteId, previewUrl?: string) => {
        if (process.env.OC_TESTING_FIXTURE === "1") {
          assertTestingFixtureAllowed();
          return { suite, status: "passed", details: "api-testing-fixture" };
        }
        return runSuite(runnerDeps, {
          suite,
          command: defaultCommandForSuite(suite),
          previewUrl,
        });
      },
      loadRequirementIntegrations: (pid) => {
        try {
          return loadRequirementSession(db, pid).state.integrations;
        } catch {
          return [];
        }
      },
      runPreviewIntegrationChecks:
        integrationChecksEnabled && callIntegration
          ? async (previewUrl, label, enabledIntegrationIds) =>
              runPreviewIntegrationChecks(
                { db, projectId, callIntegration, enabledIntegrationIds, onEvent },
                previewUrl,
                label,
              )
          : undefined,
      runAgent: async (input) => {
        let enabledIntegrationIds: string[] = [];
        try {
          const raw = loadRequirementSession(db, projectId).state.integrations;
          if (raw.length > 0) {
            const applied = await applyRequirementIntegrations(
              { db, projectId, onEvent },
              raw,
            );
            enabledIntegrationIds = applied.normalizedIntegrations;
          }
        } catch {
          enabledIntegrationIds = [];
        }

        return runAgent(
          {
            db,
            onEvent,
            runner: createDevelopmentRunner(db, { mode: resolveEngineMode() }),
            callIntegration:
              input.agentIdAtVersion.startsWith("qa@") && callIntegration
                ? { ...callIntegration, caller: "agent" as const }
                : undefined,
            enabledIntegrationIds:
              input.agentIdAtVersion.startsWith("qa@") ? enabledIntegrationIds : undefined,
          },
          { ...input, task: input.task as DevAgentTask },
        );
      },
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
      const result = await runTestingPhase(buildDeps(projectId), { projectId, ...options });
      if (result.phase === "failed") {
        development.startFinalRepair({
          projectId,
          suiteResults: result.suiteResults,
          qaNotes: result.qaNotes,
          requestDeploy: options.requestDeploy,
        });
        return result;
      }
      const status = projects.getProject(projectId)?.status;
      if (status === "Deploying") {
        deployment.start(projectId);
      } else if (status === "Awaiting Acceptance") {
        await delivery.enterAwaitingAcceptance(projectId);
      }
      return result;
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
      const payload = loadDevSession(db, projectId);
      saveDevSession(db, projectId, {
        ...payload,
        state: { ...payload.state, previewUrl: undefined },
        testing: payload.testing
          ? { ...payload.testing, previewUrl: undefined }
          : payload.testing,
      });
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
