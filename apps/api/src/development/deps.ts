import {
  runAgent,
  createDevelopmentRunner,
  resolveCodingHarness,
  resolveEngineMode,
  createAskHuman,
  type DevAgentTask,
  type DevFixtureProfile,
} from "@oc/agent-core";
import {
  classifyCommandChain,
  createAuthorize,
  parseTypecheckOutput,
  readOutputText,
  resolveTypecheckCommand,
  runCommand,
} from "@oc/workspace";
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
  // 0 = block until the user resolves the gate (no timeout). Set OC_GATE_WAIT_TIMEOUT_MS for a cap.
  const devGateTimeoutMs =
    process.env.OC_GATE_WAIT_TIMEOUT_MS !== undefined
      ? Number(process.env.OC_GATE_WAIT_TIMEOUT_MS)
      : 0;

  return {
    db: ctx.db,
    onEvent: ctx.onEvent,
    repoPath: paths.repo,
    logsPath: paths.logs,
    harness: resolveCodingHarness(mode),
    authorize:
      mode === "stub"
        ? async () => ({ allow: true as const })
        : createAuthorize(projectId, {
            repoPath: paths.repo,
            createGate: (_pid, gateType, metadata) =>
              ctx.gates.createGate(projectId, gateType, metadata),
            waitForGate: (gateId) =>
              ctx.gates.waitForGate(gateId, { timeoutMs: devGateTimeoutMs }),
          }),
    runAuthoritativeCheck:
      mode === "stub"
        ? async () => ({ passed: true, details: "stub-engine-pass" })
        : createRunAuthoritativeCheck(shell),
    runSliceTypecheck:
      mode === "stub"
        ? undefined
        : async () => {
            const command = resolveTypecheckCommand(paths.repo);
            if (!command) {
              return { passed: true, details: "typecheck skipped (no tsconfig/tsc)" };
            }
            const result = await runCommand(shell, {
              projectId,
              cmd: command,
              cwd: paths.repo,
            });
            const parsed = parseTypecheckOutput(readOutputText(result.outputRef), "");
            return { passed: parsed.passed, details: parsed.details };
          },
    classifyShellRisk: (command) => classifyCommandChain(command, { repoPath: paths.repo }),
    runGovernedCommand: async (command) => {
      const result = await runCommand(shell, { projectId, cmd: command });
      const combined = readOutputText(result.outputRef);
      return {
        exitCode: result.exitCode,
        stdout: combined,
        stderr: "",
      };
    },
    askHuman:
      mode === "stub"
        ? undefined
        : (_pid, question) =>
            createAskHuman(projectId, {
              createGate: (_p, gateType, metadata) =>
                ctx.gates.createGate(projectId, gateType, metadata),
              waitForGate: (gateId) =>
                ctx.gates.waitForGate(gateId, { timeoutMs: devGateTimeoutMs }),
            })(question),
    runAgent: async (input) =>
      runAgent(
        {
          db: ctx.db,
          onEvent: ctx.onEvent,
          authorize:
            mode === "stub"
              ? async () => ({ allow: true as const })
              : createAuthorize(projectId, {
                  repoPath: paths.repo,
                  createGate: (_pid, gateType, metadata) =>
                    ctx.gates.createGate(projectId, gateType, metadata),
                  waitForGate: (gateId) =>
                    ctx.gates.waitForGate(gateId, { timeoutMs: devGateTimeoutMs }),
                }),
          repoPath: paths.repo,
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
