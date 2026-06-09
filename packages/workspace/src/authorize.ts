import path from "node:path";
import type { AuthDecision, ToolOp } from "@oc/agent-core";
import { classifyToolOp } from "./risk.js";
import type { GateRecord, ShellDeps } from "./shell.js";
import { CommandRejectedError } from "./shell.js";

function normalizeToolPath(repoPath: string, rawPath?: string): string | undefined {
  if (!rawPath) {
    return undefined;
  }

  const repoRoot = path.resolve(repoPath);
  const candidate = path.isAbsolute(rawPath)
    ? path.relative(repoRoot, path.resolve(rawPath))
    : rawPath;

  if (!candidate || candidate.startsWith("..") || path.isAbsolute(candidate)) {
    return undefined;
  }

  return candidate;
}

export type AuthorizeDeps = {
  repoPath: string;
  createGate: ShellDeps["createGate"];
  waitForGate: ShellDeps["waitForGate"];
};

function isApproval(decision: string): boolean {
  return decision === "approve" || decision === "skip_risk_and_continue";
}

function gateTypeForTool(risk: ReturnType<typeof classifyToolOp>): "dangerous_operation" | "deployment" | null {
  if (risk === "high") {
    return "dangerous_operation";
  }
  if (risk === "high_deploy") {
    return "deployment";
  }
  return null;
}

export function createAuthorize(
  projectId: string,
  deps: AuthorizeDeps,
): (op: ToolOp) => Promise<AuthDecision> {
  return async (op: ToolOp): Promise<AuthDecision> => {
    const normalizedPath = normalizeToolPath(deps.repoPath, op.path);
    if (op.path && !normalizedPath) {
      return { allow: false, reason: "Path escapes project root" };
    }

    const risk = classifyToolOp(
      { kind: op.kind, command: op.command, path: normalizedPath },
      { repoPath: deps.repoPath },
    );

    const gateType = gateTypeForTool(risk);
    if (!gateType) {
      return { allow: true };
    }

    let gate: GateRecord;
    try {
      gate = deps.createGate(projectId, gateType, {
        riskLevel: risk === "high_deploy" ? "high" : risk === "high" ? "high" : "medium",
      });
      const decision = await deps.waitForGate(gate.id);
      if (!isApproval(decision)) {
        return { allow: false, reason: `Gate rejected: ${decision}` };
      }
      return { allow: true };
    } catch (error) {
      if (error instanceof CommandRejectedError) {
        return { allow: false, reason: error.message };
      }
      throw error;
    }
  };
}
