import { and, desc, eq } from "drizzle-orm";
import {
  DEFAULT_TAIZI_HISTORY_TURNS,
  events,
  MAX_TAIZI_TURN_CHARS,
  type Db,
  type TaiziChatTurn,
} from "@oc/shared";

export { DEFAULT_TAIZI_HISTORY_TURNS, MAX_TAIZI_TURN_CHARS };

function truncateTurn(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

export function taiziRoutedPayloadsToTurns(
  payloads: Array<{ message?: string; reply?: string }>,
  maxCharsPerTurn: number,
): TaiziChatTurn[] {
  const turns: TaiziChatTurn[] = [];
  for (const payload of payloads) {
    const message = String(payload.message ?? "").trim();
    const reply = String(payload.reply ?? "").trim();
    if (message) turns.push({ role: "user", content: truncateTurn(message, maxCharsPerTurn) });
    if (reply) turns.push({ role: "assistant", content: truncateTurn(reply, maxCharsPerTurn) });
  }
  return turns;
}

/** Load recent Taizi chat turns from persisted taizi.routed events (oldest first). */
export function loadTaiziChatHistory(
  db: Db,
  projectId: string,
  options: { maxTurns?: number; maxCharsPerTurn?: number } = {},
): TaiziChatTurn[] {
  const maxTurns = options.maxTurns ?? DEFAULT_TAIZI_HISTORY_TURNS;
  const maxChars = options.maxCharsPerTurn ?? MAX_TAIZI_TURN_CHARS;

  const rows = db
    .select()
    .from(events)
    .where(and(eq(events.project_id, projectId), eq(events.type, "taizi.routed")))
    .orderBy(desc(events.seq))
    .limit(maxTurns)
    .all();

  const payloads = [...rows].reverse().map((row) => {
    const parsed = JSON.parse(row.payload) as { message?: string; reply?: string };
    return { message: parsed.message, reply: parsed.reply };
  });

  return taiziRoutedPayloadsToTurns(payloads, maxChars);
}
