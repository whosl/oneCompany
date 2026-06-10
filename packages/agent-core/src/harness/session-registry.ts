import type { OpencodeClient } from "@opencode-ai/sdk";

export type ActiveHarnessSession = {
  client: OpencodeClient;
  sessionId: string;
  directory: string;
};

/** Live opencode sessions per project (in-memory; dies with the process). */
const ACTIVE_SESSIONS = new Map<string, ActiveHarnessSession>();

export function registerHarnessSession(projectId: string, session: ActiveHarnessSession): void {
  ACTIVE_SESSIONS.set(projectId, session);
}

export function unregisterHarnessSession(projectId: string, sessionId: string): void {
  if (ACTIVE_SESSIONS.get(projectId)?.sessionId === sessionId) {
    ACTIVE_SESSIONS.delete(projectId);
  }
}

export function getActiveHarnessSession(projectId: string): ActiveHarnessSession | undefined {
  return ACTIVE_SESSIONS.get(projectId);
}

/**
 * Deliver a user interjection into the project's live opencode session.
 * The message is queued as a user prompt — the agent picks it up on its next
 * turn (Claude-Code-style steering). With `abort: true` the current generation
 * is interrupted first so the new instruction takes effect immediately.
 *
 * Returns false when no session is live (caller should fall back, e.g. to a
 * change request).
 */
export async function steerHarnessSession(
  projectId: string,
  message: string,
  options: { abort?: boolean } = {},
): Promise<boolean> {
  const session = ACTIVE_SESSIONS.get(projectId);
  if (!session) return false;

  const query = { directory: session.directory };
  if (options.abort) {
    try {
      await session.client.session.abort({ path: { id: session.sessionId }, query });
    } catch {
      // Abort is best-effort; the prompt below still queues the new info.
    }
  }

  await session.client.session.promptAsync({
    path: { id: session.sessionId },
    query,
    body: {
      parts: [
        {
          type: "text",
          text: `[用户插话 — 请优先遵循以下新指示]\n${message}`,
        },
      ],
    },
  });
  return true;
}
