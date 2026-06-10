import type { OpencodeClient, Permission } from "@opencode-ai/sdk";
import type { AuthDecision, ToolOp } from "./types.js";

export type AuthorizeFn = (op: ToolOp) => Promise<AuthDecision>;

export type CommandExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ShellRiskLevel = "low" | "medium" | "medium_constrained" | "high" | "high_deploy";

export type PermissionBridgeDeps = {
  directory?: string;
  classifyShellRisk?: (command: string) => ShellRiskLevel;
  runGovernedCommand?: (command: string) => Promise<CommandExecResult>;
};

function isHighRiskShell(risk: ShellRiskLevel | undefined): boolean {
  return risk === "high" || risk === "high_deploy";
}

export function extractOcGatewayToolName(permission: unknown): string | undefined {
  if (!permission || typeof permission !== "object") {
    return undefined;
  }
  const record = permission as Record<string, unknown>;
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : {};
  const candidates = [
    metadata.toolName,
    metadata.tool,
    metadata.name,
    record.title,
    record.pattern,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("oc_")) {
      return candidate;
    }
  }
  return undefined;
}

export function toToolOp(permission: unknown): ToolOp {
  if (!permission || typeof permission !== "object") {
    return { kind: "other" };
  }

  const record = permission as Record<string, unknown>;
  const metadata =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : {};

  const kind = record.kind ?? record.type;
  if (kind === "shell" || kind === "bash") {
    const command =
      typeof metadata.command === "string"
        ? metadata.command
        : typeof record.command === "string"
          ? record.command
          : typeof record.pattern === "string"
            ? record.pattern
            : undefined;
    return { kind: "shell", command };
  }
  if (kind === "edit" || kind === "write") {
    const path =
      typeof metadata.path === "string"
        ? metadata.path
        : typeof record.path === "string"
          ? record.path
          : typeof record.pattern === "string"
            ? record.pattern
            : undefined;
    return { kind: "edit", path };
  }
  if (kind === "read") {
    const path =
      typeof metadata.path === "string"
        ? metadata.path
        : typeof record.path === "string"
          ? record.path
          : undefined;
    return { kind: "read", path };
  }
  if (kind === "patch" || kind === "multiedit") {
    const path =
      typeof metadata.path === "string"
        ? metadata.path
        : typeof record.path === "string"
          ? record.path
          : undefined;
    return { kind: "edit", path };
  }
  return { kind: "other" };
}

async function injectGovernedCommandResult(
  client: OpencodeClient,
  sessionId: string,
  directory: string | undefined,
  command: string,
  result: CommandExecResult,
): Promise<void> {
  const text = [
    "[OneCompany governed execution]",
    `Command: ${command}`,
    `Exit code: ${result.exitCode}`,
    result.stdout ? `stdout:\n${result.stdout}` : "",
    result.stderr ? `stderr:\n${result.stderr}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await client.session.promptAsync({
    path: { id: sessionId },
    query: directory ? { directory } : undefined,
    body: {
      parts: [{ type: "text", text }],
    },
  });
}

export async function handlePermission(
  client: OpencodeClient,
  sessionId: string,
  permission: Permission,
  authorize: AuthorizeFn,
  deps: PermissionBridgeDeps = {},
): Promise<AuthDecision> {
  const gatewayTool = extractOcGatewayToolName(permission);
  if (gatewayTool) {
    await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permission.id },
      body: { response: "once" },
      query: deps.directory ? { directory: deps.directory } : undefined,
    });
    return { allow: true };
  }

  const toolOp = toToolOp(permission);
  const shellCommand = toolOp.kind === "shell" ? toolOp.command : undefined;
  const shellRisk =
    shellCommand && deps.classifyShellRisk
      ? deps.classifyShellRisk(shellCommand)
      : undefined;
  const requiresGovernedExecution =
    Boolean(shellCommand) && isHighRiskShell(shellRisk) && Boolean(deps.runGovernedCommand);

  const decision = await authorize(toolOp);
  if (!decision.allow) {
    await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permission.id },
      body: { response: "reject" },
      query: deps.directory ? { directory: deps.directory } : undefined,
    });
    return decision;
  }

  if (requiresGovernedExecution && shellCommand) {
    await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permission.id },
      body: { response: "reject" },
      query: deps.directory ? { directory: deps.directory } : undefined,
    });

    try {
      const result = await deps.runGovernedCommand!(shellCommand);
      await injectGovernedCommandResult(
        client,
        sessionId,
        deps.directory,
        shellCommand,
        result,
      );
      return { allow: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { allow: false, reason: message };
    }
  }

  await client.postSessionIdPermissionsPermissionId({
    path: { id: sessionId, permissionID: permission.id },
    body: { response: "once" },
    query: deps.directory ? { directory: deps.directory } : undefined,
  });
  return decision;
}
