import type { OpencodeClient } from "@opencode-ai/sdk";
import type { EventBridgeHandle } from "./event-bridge.js";
import { DEFAULT_SDK_CALL_TIMEOUT_MS, withTimeout } from "./sdk-timeout.js";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = Number(
  process.env.OC_OPENCODE_WAIT_HEARTBEAT_MS ?? 30_000,
);

export type WaitForSessionOptions = {
  onHeartbeat?: (elapsedMs: number) => void;
  heartbeatIntervalMs?: number;
  sdkCallTimeoutMs?: number;
};

/**
 * Block until the opencode session is genuinely idle, or throw on timeout.
 * Never treats "assistant text exists" as completion — only session.idle + no running tools.
 */
export async function waitForSessionCompletion(
  client: OpencodeClient,
  bridge: EventBridgeHandle,
  sessionId: string,
  directory: string,
  timeoutMs: number,
  options: WaitForSessionOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  const idleGraceMs = Number(process.env.OC_OPENCODE_IDLE_GRACE_MS ?? 15_000);
  const idleStreakRequired = Number(process.env.OC_OPENCODE_IDLE_STREAK ?? 2);
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const sdkCallTimeoutMs = options.sdkCallTimeoutMs ?? DEFAULT_SDK_CALL_TIMEOUT_MS;
  let idleStreak = 0;
  let lastHeartbeatAt = startedAt;

  const maybeHeartbeat = () => {
    if (!options.onHeartbeat) {
      return;
    }
    const now = Date.now();
    if (now - lastHeartbeatAt < heartbeatIntervalMs) {
      return;
    }
    lastHeartbeatAt = now;
    options.onHeartbeat(now - startedAt);
  };

  while (Date.now() < deadline) {
    const hasFiles = bridge.changedFiles.size > 0;
    const idle = bridge.isIdle();
    const elapsed = Date.now() - startedAt;

    if (idle) {
      idleStreak += 1;
    } else {
      idleStreak = 0;
    }

    if (hasFiles && idleStreak >= 1) {
      return;
    }

    if (idleStreak >= idleStreakRequired && elapsed >= idleGraceMs) {
      return;
    }

    maybeHeartbeat();
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // Final poll: bridge may have missed session.idle while we slept.
  if (bridge.isIdle()) {
    return;
  }

  // Last-resort check against the server (bounded — must not hang forever).
  const idleOnServer = await sessionReportsIdle(client, sessionId, directory, sdkCallTimeoutMs);
  if (idleOnServer && bridge.isIdle()) {
    return;
  }

  throw new Error(
    `opencode session completion timeout after ${timeoutMs}ms (session not idle)`,
  );
}

async function sessionReportsIdle(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
  sdkCallTimeoutMs: number,
): Promise<boolean> {
  try {
    const response = await withTimeout(
      client.session.messages({
        path: { id: sessionId },
        query: { directory },
      }),
      sdkCallTimeoutMs,
      "opencode session.messages",
    );
    const messages = response.data ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i]!;
      for (const part of message.parts) {
        if (part.type !== "tool") {
          continue;
        }
        const status = part.state?.status;
        if (status === "running" || status === "pending") {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
