import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { emit, toolCalls, type Db, type EventEnvelope, type GateMetadata } from "@oc/shared";
import { classifyCommand } from "./risk.js";
import type { RiskLevel } from "./risk.js";
import { persistOutput, type OutputRef } from "./log-pipeline.js";
import { DockerUnavailableError } from "./sandbox.js";

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type GateRecord = {
  id: string;
  projectId: string;
  gateType: string;
};

export type ShellDeps = {
  db: Db;
  projectId: string;
  repoPath: string;
  logsPath: string;
  onEvent?: (envelope: EventEnvelope) => void;
  createGate: (projectId: string, gateType: string, metadata?: GateMetadata) => GateRecord;
  waitForGate: (gateId: string) => Promise<string>;
  runLocal: (cmd: string, cwd: string) => Promise<ExecResult>;
  runSandbox: (cmd: string, projectPath: string) => Promise<ExecResult>;
  isDockerAvailable: () => boolean | Promise<boolean>;
};

export type RunCommandInput = {
  projectId: string;
  cmd: string;
  cwd?: string;
};

export type RunCommandResult = {
  exitCode: number;
  outputRef: OutputRef;
  gated?: boolean;
};

export class CommandRejectedError extends Error {
  gateId?: string;
  gateType?: string;

  constructor(message: string, gate?: { id: string; gateType: string }) {
    super(message);
    this.name = "CommandRejectedError";
    if (gate) {
      this.gateId = gate.id;
      this.gateType = gate.gateType;
    }
  }
}

function gateTypeForRisk(risk: RiskLevel): "dangerous_operation" | "deployment" | null {
  if (risk === "high") {
    return "dangerous_operation";
  }
  if (risk === "high_deploy") {
    return "deployment";
  }
  return null;
}

function riskMetadata(risk: RiskLevel): GateMetadata | undefined {
  if (risk === "high") {
    return { riskLevel: "high" };
  }
  if (risk === "medium_constrained" || risk === "medium") {
    return { riskLevel: "medium" };
  }
  if (risk === "low") {
    return { riskLevel: "low" };
  }
  return undefined;
}

function isApproval(decision: string): boolean {
  return decision === "approve" || decision === "skip_risk_and_continue";
}

async function ensureGateApproval(
  deps: ShellDeps,
  risk: RiskLevel,
  cmd: string,
): Promise<void> {
  const gateType = gateTypeForRisk(risk);
  if (!gateType) {
    return;
  }

  const gate = deps.createGate(deps.projectId, gateType, riskMetadata(risk));
  const decision = await deps.waitForGate(gate.id);
  if (!isApproval(decision)) {
    throw new CommandRejectedError(`Command rejected by gate: ${cmd}`, {
      id: gate.id,
      gateType: gate.gateType,
    });
  }
}

export async function runCommand(deps: ShellDeps, input: RunCommandInput): Promise<RunCommandResult> {
  const cwd = input.cwd ?? deps.repoPath;
  const risk = classifyCommand(input.cmd, { repoPath: deps.repoPath });
  const toolCallId = randomUUID();
  const rowId = randomUUID();
  const now = new Date().toISOString();

  const started = emit(deps.db, {
    projectId: input.projectId,
    payload: {
      type: "tool_call.started",
      projectId: input.projectId,
      toolCallId,
      toolName: "shell",
    },
  });
  deps.onEvent?.(started);

  deps.db
    .insert(toolCalls)
    .values({
      id: rowId,
      project_id: input.projectId,
      tool_call_id: toolCallId,
      tool_name: "shell",
      status: "running",
      created_at: now,
    })
    .run();

  try {
    await ensureGateApproval(deps, risk, input.cmd);

    let execResult: ExecResult;
    if (risk === "high") {
      const dockerOk = await Promise.resolve(deps.isDockerAvailable());
      if (!dockerOk) {
        throw new DockerUnavailableError();
      }
      execResult = await deps.runSandbox(input.cmd, cwd);
    } else {
      execResult = await deps.runLocal(input.cmd, cwd);
    }

    const combined = [execResult.stdout, execResult.stderr].filter(Boolean).join("\n");
    const outputRef = persistOutput(
      {
        db: deps.db,
        projectId: input.projectId,
        logsPath: deps.logsPath,
        toolCallId,
      },
      combined,
    );

    const summary =
      outputRef.kind === "inline" ? outputRef.text.slice(0, 500) : outputRef.summary;

    const completed = emit(deps.db, {
      projectId: input.projectId,
      payload: {
        type: "tool_call.output",
        projectId: input.projectId,
        toolCallId,
        output: summary,
      },
    });
    deps.onEvent?.(completed);

    deps.db
      .update(toolCalls)
      .set({
        status: "completed",
        output_ref: JSON.stringify(outputRef),
      })
      .where(eq(toolCalls.id, rowId))
      .run();

    return {
      exitCode: execResult.exitCode,
      outputRef,
      gated: gateTypeForRisk(risk) !== null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = emit(deps.db, {
      projectId: input.projectId,
      payload: {
        type: "tool_call.failed",
        projectId: input.projectId,
        toolCallId,
        error: message,
      },
    });
    deps.onEvent?.(failed);

    deps.db
      .update(toolCalls)
      .set({ status: "failed", output_ref: message })
      .where(eq(toolCalls.id, rowId))
      .run();

    throw error;
  }
}
