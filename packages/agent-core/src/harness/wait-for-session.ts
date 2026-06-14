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
  /**
   * Reads the trailing assistant message text for this session. Used to detect
   * a structured `{"coding_question":"..."}` signal when the agent idles.
   * Undefined disables question detection entirely.
   */
  readLastAssistantText?: () => Promise<string>;
};

/**
 * Completion outcome. "completed" = the agent finished its turn (with or
 * without file changes). "awaiting_answer" = the agent emitted a structured
 * clarifying question and is waiting for a human answer to continue.
 */
export type CompletionResult =
  | { kind: "completed" }
  | { kind: "awaiting_answer"; questionText: string };

/**
 * Regex that matches a trailing `{"coding_question":"..."}` JSON signal in the
 * assistant's last message. Anchored to the end of the text; tolerant of
 * surrounding whitespace. The question text is captured (single-line).
 */
const CODING_QUESTION_RE = /\{"coding_question"\s*:\s*"([^"]*)"\}\s*$/;

/** Extract the clarifying-question text from the trailing assistant reply. */
export function parseCodingQuestionSignal(text: string): string | undefined {
  const trimmed = text.trimEnd();
  if (!trimmed) return undefined;
  const match = trimmed.match(CODING_QUESTION_RE);
  if (!match) return undefined;
  const question = match[1]?.trim();
  return question ? question : undefined;
}

/**
 * Block until the opencode session is genuinely idle, or throw on timeout.
 * Completion requires session.idle (via the event bridge) — never "no running
 * tools" alone, which fires falsely while the model is still between turns.
 *
 * On each idle tick, inspects the trailing assistant text for a
 * `{"coding_question":"..."}` signal. If found, returns
 * `{ kind: "awaiting_answer" }` so the caller can raise a gate, inject the
 * human's answer, and call this again to wait for the resumed turn.
 *
 * Question detection runs even when the session already has file changes:
 * `bridge.changedFiles` is session-cumulative, so gating on "no files yet"
 * would swallow any question the agent asks AFTER editing some files (e.g. a
 * second clarification mid-slice). Instead we dedupe by the assistant text
 * signature — re-checking only when the trailing reply changed (i.e. a new
 * turn produced fresh text after an injected answer).
 */
export async function waitForSessionCompletion(
  client: OpencodeClient,
  bridge: EventBridgeHandle,
  sessionId: string,
  directory: string,
  timeoutMs: number,
  options: WaitForSessionOptions = {},
): Promise<CompletionResult> {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  const idleGraceMs = Number(process.env.OC_OPENCODE_IDLE_GRACE_MS ?? 15_000);
  const idleStreakRequired = Number(process.env.OC_OPENCODE_IDLE_STREAK ?? 2);
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const sdkCallTimeoutMs = options.sdkCallTimeoutMs ?? DEFAULT_SDK_CALL_TIMEOUT_MS;
  let idleStreak = 0;
  let lastHeartbeatAt = startedAt;
  // Signature of the assistant text we last checked for a question signal.
  // Prevents re-polling the message API every tick for the SAME idle spell,
  // while still re-checking after a new turn (the text changes once the agent
  // responds to an injected answer). Uses content length + a tail slice so we
  // don't hold the full text in memory.
  let lastCheckedSignature = "";
  const signatureOf = (text: string): string => `${text.length}:${text.slice(-64)}`;

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

    // When the agent idles, inspect its trailing reply for a structured
    // question signal BEFORE deciding the turn completed. Dedupe by text
    // signature so we re-check after a new turn (an injected answer elicits
    // fresh text) but not on every poll of the same idle spell. Runs even when
    // files already changed this session — changedFiles is cumulative and a
    // second question after edits must not be swallowed as completion.
    if (idleStreak >= 1 && options.readLastAssistantText) {
      try {
        const text = await options.readLastAssistantText();
        const sig = signatureOf(text);
        if (sig !== lastCheckedSignature) {
          lastCheckedSignature = sig;
          const question = parseCodingQuestionSignal(text);
          if (question) {
            return { kind: "awaiting_answer", questionText: question };
          }
        }
      } catch {
        // Message read failed (transient SDK hiccup) — fall through to normal
        // completion logic; the next tick retries.
      }
    }

    if (hasFiles && idleStreak >= 1) {
      return { kind: "completed" };
    }

    if (idleStreak >= idleStreakRequired && elapsed >= idleGraceMs) {
      return { kind: "completed" };
    }

    maybeHeartbeat();
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (bridge.isIdle()) {
    return { kind: "completed" };
  }

  // Bridge missed session.idle (rare after session.diff fix) — only trust the
  // server when we did observe idle at least once for this session.
  if (bridge.hasSeenSessionIdle()) {
    const idleOnServer = await sessionReportsIdle(client, sessionId, directory, sdkCallTimeoutMs);
    if (idleOnServer) {
      return { kind: "completed" };
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
