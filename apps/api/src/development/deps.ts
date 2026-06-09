import {
  runAgent,
  createDevelopmentRunner,
  resolveCodingHarness,
  resolveEngineMode,
  type DevAgentTask,
  type DevFixtureProfile,
} from "@oc/agent-core";
import { createAuthorize } from "@oc/workspace";
import type { DevelopmentWorkflowDeps } from "@oc/workflow";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import { createRunAuthoritativeCheck } from "./authoritative-check.js";

export type DevelopmentServiceContext = {
  db: Db;
  projects: ProjectService;
  gates: GateService;
  workspace: WorkspaceService;
  onEvent: (envelope: EventEnvelope) => void;
};

export type DevelopmentDepsOptions = {
  profile?: DevFixtureProfile;
};

export function createDevelopmentDeps(
  ctx: DevelopmentServiceContext,
  projectId: string,
  options: DevelopmentDepsOptions = {},
): DevelopmentWorkflowDeps {
  const project = ctx.projects.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const paths = ctx.workspace.ensureForProject(project);
  const shell = ctx.workspace.createShellDeps(project);
  const mode = resolveEngineMode();

  return {
    db: ctx.db,
    onEvent: ctx.onEvent,
    repoPath: paths.repo,
    harness: resolveCodingHarness(mode),
    authorize:
      mode === "stub"
        ? async () => ({ allow: true as const })
        : createAuthorize(projectId, {
            repoPath: paths.repo,
            createGate: (_pid, gateType, metadata) =>
              ctx.gates.createGate(projectId, gateType, metadata),
            waitForGate: (gateId) => ctx.gates.waitForGate(gateId),
          }),
    runAuthoritativeCheck:
      mode === "stub"
        ? async () => ({ passed: true, details: "stub-engine-pass" })
        : createRunAuthoritativeCheck(shell),
    runAgent: async (input) =>
      runAgent(
        {
          db: ctx.db,
          onEvent: ctx.onEvent,
          runner: createDevelopmentRunner(ctx.db, {
            mode,
            devProfile: options.profile,
          }),
        },
        { ...input, task: input.task as DevAgentTask },
      ),
    createGate: (pid, gateType) => {
      const gate = ctx.gates.createGate(pid, gateType);
      return { id: gate.id };
    },
    setStatus: (pid, status, trigger) => {
      ctx.projects.setStatus(pid, status, trigger);
    },
    getProjectStatus: (pid) => {
      const row = ctx.projects.getProject(pid);
      if (!row) {
        throw new Error(`Project not found: ${pid}`);
      }
      return row.status;
    },
  };
}
