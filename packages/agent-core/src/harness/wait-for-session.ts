import type { OpencodeClient } from "@opencode-ai/sdk";
import type { EventBridgeHandle } from "./event-bridge.js";
import { DEFAULT_SDK_CALL_TIMEOUT_MS, withTimeout } from "./sdk-timeout.js";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = Number(
  process.env.OC_OPENCODE_WAIT_HEARTBEAT_MS ?? 30_000,
);

const POLL_INTERVAL_MS = 1500;

export type WaitForSessionOptions = {
  onHeartbeat?: (elapsedMs: number) => void;
  heartbeatIntervalMs?: number;
  sdkCallTimeoutMs?: number;
};

/**
 * Block until the opencode session is genuinely idle, or throw on timeout.
 * Completion requires session.idle (via the event bridge) — never "no running
 * tools" alone, which fires falsely while the model is still between turns.
 */
export async function waitForSessionCompletion(
  client: OpencodeClient,
  bridge: EventBridgeHandle,
  sessionId: string,
  directory: string,
  timeoutMs: number,
  options: WaitForSessionOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  let deadline = startedAt + timeoutMs;
  const maxDeadline = startedAt + timeoutMs * 3;
  const stallTimeoutMs = Number(process.env.OC_OPENCODE_STALL_TIMEOUT_MS ?? 180_000);
  const idleGraceMs = Number(process.env.OC_OPENCODE_IDLE_GRACE_MS ?? 15_000);
  const idleStreakRequired = Number(process.env.OC_OPENCODE_IDLE_STREAK ?? 2);
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const sdkCallTimeoutMs = options.sdkCallTimeoutMs ?? DEFAULT_SDK_CALL_TIMEOUT_MS;
  let idleStreak = 0;
  let lastHeartbeatAt = startedAt;
  let lastProgressAt = startedAt;
  let lastChangedFileCount = bridge.changedFiles.size;

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

  while (true) {
    const now = Date.now();
    const hasFiles = bridge.changedFiles.size > 0;
    const hasNewFiles = bridge.changedFiles.size > lastChangedFileCount;
    const idle = bridge.isIdle();
    const elapsed = now - startedAt;

    if (hasNewFiles) {
      lastChangedFileCount = bridge.changedFiles.size;
    }

    if (bridge.hasRecentActivity(stallTimeoutMs) || hasNewFiles) {
      lastProgressAt = now;
      const extension = timeoutMs * 0.5;
      if (now + extension > deadline && now < maxDeadline) {
        deadline = Math.min(now + extension, maxDeadline);
      }
    }

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

    if (now >= deadline && now - lastProgressAt >= stallTimeoutMs) {
      break;
    }

    maybeHeartbeat();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (bridge.isIdle()) {
    return;
  }

  // Bridge missed session.idle (rare after session.diff fix) — only trust the
  // server when we did observe idle at least once for this session.
  if (bridge.hasSeenSessionIdle()) {
    const idleOnServer = await sessionReportsIdle(client, sessionId, directory, sdkCallTimeoutMs);
    if (idleOnServer) {
      return;
    }
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
