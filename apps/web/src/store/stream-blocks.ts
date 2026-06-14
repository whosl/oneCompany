/**
 * Turn model + stream block partitioning.
 * Ported verbatim from apps/tui/src/codex-turns.ts (minus the React render bits).
 *
 * The flat timeline is partitioned into three block types for Codex-style
 * rendering: user bubbles, collapsible activity-group turns, and standalone
 * status/gate lines. A user message opens a turn; execution entries accumulate
 * as activities; a taizi reply or reflect reason becomes a primary conclusion
 * that closes the turn.
 */

import type { ConsoleState, TimelineEntry, TimelineKind } from "./types";

export type EntryImportance = "primary" | "execution" | "critical";

export type TurnStatus = "running" | "done" | "failed";

export type TurnStats = {
  durationMs: number;
  toolCalls: number;
  filesModified: number;
  testsPassed: number;
  testsFailed: number;
  errors: number;
};

export type Turn = {
  id: string;
  threadId: string;
  userEntry?: TimelineEntry;
  activities: TimelineEntry[];
  /** Always-visible conclusion (taizi, reflect, standalone agent reply). */
  primaryEntries: TimelineEntry[];
  status: TurnStatus;
  startedAtMs: number;
  endedAtMs?: number;
};

export type StreamBlock =
  | { type: "user"; entry: TimelineEntry }
  | { type: "turn"; turn: Turn }
  | { type: "standalone"; entry: TimelineEntry };

const EXECUTION_KINDS = new Set<TimelineKind>([
  "agent",
  "reason",
  "tool",
  "tool_ok",
  "tool_err",
  "tool_redirect",
  "test",
  "artifact",
  "deploy",
  "info",
  "error",
  "prompt",
]);

/** Metadata applied when entries are pushed onto the timeline. */
export function entryDefaults(
  kind: TimelineKind,
  tag: string,
): { importance: EntryImportance; defaultExpanded: boolean } {
  switch (kind) {
    case "user":
    case "taizi":
      return { importance: "primary", defaultExpanded: true };
    case "gate":
    case "question":
      return { importance: "critical", defaultExpanded: true };
    case "error":
    case "tool_err":
      return { importance: "critical", defaultExpanded: true };
    case "reason":
      return {
        importance: tag === "REFLT" ? "primary" : "execution",
        defaultExpanded: tag === "REFLT",
      };
    default:
      if (EXECUTION_KINDS.has(kind)) {
        return { importance: "execution", defaultExpanded: false };
      }
      return { importance: "primary", defaultExpanded: true };
  }
}

export function isExecutionKind(kind: TimelineKind): boolean {
  return EXECUTION_KINDS.has(kind);
}

export function isPrimaryConclusion(entry: TimelineEntry): boolean {
  if (entry.kind === "taizi") return true;
  if (entry.kind === "reason" && entry.tag === "REFLT") return true;
  return false;
}

function parseEntryMs(entry: TimelineEntry): number {
  const parts = entry.at.split(":");
  if (parts.length >= 2) {
    const now = new Date();
    now.setHours(Number(parts[0]), Number(parts[1]), Number(parts[2] ?? 0), 0);
    return now.getTime();
  }
  return Date.now();
}

function inferTurnStatus(activities: TimelineEntry[]): TurnStatus {
  if (activities.some((e) => e.kind === "error" || e.kind === "tool_err")) return "failed";
  if (activities.some((e) => e.kind === "tool")) return "running";
  if (activities.some((e) => e.tag === "PLAN" || e.tag === "ACT")) return "running";
  return "done";
}

function flushTurn(partial: Omit<Turn, "status"> & { status?: TurnStatus }): Turn {
  const status = partial.status ?? inferTurnStatus(partial.activities);
  const started = partial.startedAtMs;
  const ended =
    partial.endedAtMs ??
    (partial.activities.length > 0
      ? parseEntryMs(partial.activities[partial.activities.length - 1]!)
      : started);
  return { ...partial, status, endedAtMs: ended };
}

function turnBlockId(entry: TimelineEntry): string {
  return `turn-${entry.seq}`;
}

/** Partition a filtered timeline into Codex stream blocks. */
export function buildStreamBlocks(entries: TimelineEntry[]): StreamBlock[] {
  const blocks: StreamBlock[] = [];
  let turn: Turn | null = null;

  const closeTurn = (): void => {
    if (!turn) return;
    if (turn.activities.length === 0 && turn.primaryEntries.length === 0 && !turn.userEntry) {
      turn = null;
      return;
    }
    blocks.push({ type: "turn", turn: flushTurn(turn) });
    turn = null;
  };

  for (const entry of entries) {
    if (entry.kind === "user") {
      closeTurn();
      blocks.push({ type: "user", entry });
      turn = {
        id: turnBlockId(entry),
        threadId: entry.threadId ?? "main",
        userEntry: entry,
        activities: [],
        primaryEntries: [],
        status: "running",
        startedAtMs: parseEntryMs(entry),
      };
      continue;
    }

    if (entry.kind === "status" || entry.kind === "gate" || entry.kind === "gate_ok") {
      closeTurn();
      blocks.push({ type: "standalone", entry });
      continue;
    }

    if (isPrimaryConclusion(entry)) {
      if (!turn) {
        turn = {
          id: turnBlockId(entry),
          threadId: entry.threadId ?? "main",
          activities: [],
          primaryEntries: [entry],
          status: "done",
          startedAtMs: parseEntryMs(entry),
          endedAtMs: parseEntryMs(entry),
        };
        closeTurn();
        continue;
      }
      turn.primaryEntries.push(entry);
      turn.status = "done";
      turn.endedAtMs = parseEntryMs(entry);
      closeTurn();
      continue;
    }

    if (entry.kind === "error" && entry.importance === "critical" && !turn) {
      blocks.push({ type: "standalone", entry });
      continue;
    }

    if (isExecutionKind(entry.kind) || entry.kind === "error") {
      if (!turn) {
        turn = {
          id: turnBlockId(entry),
          threadId: entry.threadId ?? "main",
          activities: [],
          primaryEntries: [],
          status: "running",
          startedAtMs: parseEntryMs(entry),
        };
      }
      turn.activities.push(entry);
      if (entry.kind === "error" || entry.kind === "tool_err") turn.status = "failed";
      else if (entry.kind === "tool") turn.status = "running";
      continue;
    }

    // taizi handled above via isPrimaryConclusion; remaining kinds fall through.
    closeTurn();
    blocks.push({ type: "standalone", entry });
  }

  closeTurn();
  return blocks;
}

export function turnStats(turn: Turn): TurnStats {
  let toolCalls = 0;
  let filesModified = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let errors = 0;

  for (const entry of turn.activities) {
    if (
      entry.kind === "tool" ||
      entry.kind === "tool_ok" ||
      entry.kind === "tool_err" ||
      entry.kind === "tool_redirect"
    ) {
      toolCalls += entry.repeat ?? 1;
    }
    if (entry.kind === "artifact" && entry.tag === "DIFF") filesModified += 1;
    if (entry.kind === "artifact" && entry.tag === "FILE") filesModified += 1;
    if (entry.kind === "test") {
      if (/passed/.test(entry.text)) testsPassed += 1;
      else testsFailed += 1;
    }
    if (entry.kind === "error" || entry.kind === "tool_err") errors += 1;
  }

  const ended = turn.endedAtMs ?? Date.now();
  return {
    durationMs: Math.max(0, ended - turn.startedAtMs),
    toolCalls,
    filesModified,
    testsPassed,
    testsFailed,
    errors,
  };
}

export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

/** Agent name for a turn — shown on the collapsible header. */
export function turnAgentName(turn: Turn, state: ConsoleState): string | undefined {
  const started = turn.activities.find((e) => e.kind === "agent" && e.agent);
  if (started?.agent) return started.agent;
  const any = turn.activities.find((e) => e.agent);
  if (any?.agent) return any.agent;
  if (turn.threadId !== "main") return state.agents.get(turn.threadId)?.name;
  return undefined;
}

/** Whether the activity group for this turn should render expanded. */
export function isTurnExpanded(turn: Turn, state: ConsoleState): boolean {
  if (state.pinnedTurns.has(turn.id)) return true;
  if (state.collapsedTurns.has(turn.id)) return false;
  if (turn.status === "running") return true;
  if (turn.status === "failed") return true;
  return false;
}

export function toggleTurnExpansion(
  state: ConsoleState,
  turnId: string,
  currentlyExpanded: boolean,
): void {
  if (currentlyExpanded) {
    state.collapsedTurns.add(turnId);
    state.pinnedTurns.delete(turnId);
  } else {
    state.collapsedTurns.delete(turnId);
    state.pinnedTurns.add(turnId);
  }
}

/** Current action label for a running turn (shown in the group header). */
export function runningTurnLabel(turn: Turn, state: ConsoleState): string | undefined {
  const runningTool = [...turn.activities].reverse().find((e) => e.kind === "tool");
  if (runningTool) {
    const agent = runningTool.agent ?? state.agents.get(turn.threadId)?.name;
    return agent ? `${agent} ${runningTool.toolSummary ?? "执行中"}` : runningTool.toolSummary;
  }
  const lastAct = [...turn.activities].reverse().find((e) => e.tag === "ACT" || e.tag === "PLAN");
  if (lastAct) return lastAct.text.slice(0, 80);
  const active = state.agents.get(turn.threadId);
  if (active && (active.status === "running" || active.status === "tool")) {
    return active.act ?? active.plan ?? `${active.name} 工作中`;
  }
  return undefined;
}
