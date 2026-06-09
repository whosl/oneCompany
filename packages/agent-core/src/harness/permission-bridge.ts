import type { OpencodeClient, Permission } from "@opencode-ai/sdk";
import type { AuthDecision, ToolOp } from "./types.js";

export type AuthorizeFn = (op: ToolOp) => Promise<AuthDecision>;

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
  return { kind: "other" };
}

export async function handlePermission(
  client: OpencodeClient,
  sessionId: string,
  permission: Permission,
  authorize: AuthorizeFn,
  directory?: string,
): Promise<AuthDecision> {
  const decision = await authorize(toToolOp(permission));
  await client.postSessionIdPermissionsPermissionId({
    path: { id: sessionId, permissionID: permission.id },
    body: { response: decision.allow ? "once" : "reject" },
    query: directory ? { directory } : undefined,
  });
  return decision;
}
