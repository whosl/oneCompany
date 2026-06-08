import type { AuthDecision, ToolOp } from "./types.js";

export type AuthorizeFn = (op: ToolOp) => Promise<AuthDecision>;

export function toToolOp(permission: unknown): ToolOp {
  if (!permission || typeof permission !== "object") {
    return { kind: "other" };
  }

  const record = permission as Record<string, unknown>;
  const kind = record.kind ?? record.type;
  if (kind === "shell" || kind === "bash") {
    return {
      kind: "shell",
      command: typeof record.command === "string" ? record.command : undefined,
    };
  }
  if (kind === "edit" || kind === "write") {
    return {
      kind: "edit",
      path: typeof record.path === "string" ? record.path : undefined,
    };
  }
  if (kind === "read") {
    return {
      kind: "read",
      path: typeof record.path === "string" ? record.path : undefined,
    };
  }
  return { kind: "other" };
}

export async function handlePermission(
  _client: unknown,
  _sessionId: string,
  permission: unknown,
  authorize: AuthorizeFn,
): Promise<AuthDecision> {
  return authorize(toToolOp(permission));
}
