import {
  AGENT_CATALOG,
  agentDisplayName,
  findAgent,
  gateDefinition,
  normalizeAgentId,
  type AgentGroup,
} from "./catalog.js";
import { oneLine } from "./text.js";
import type { ConsoleSnapshot, EventEnvelope, GateInfo, PendingQuestion } from "./types.js";

/* ------------------------------------------------------------------ */
/* View model                                                           */
/* ------------------------------------------------------------------ */

export type AgentStatus = "idle" | "waiting" | "running" | "tool" | "blocked" | "done" | "failed";

export type AgentView = {
  id: string;
  name: string;
  role: string;
  description: string;
  /** Skills / tools / engine capabilities (from the fixed catalog). */
  capabilities: string[];
  group: AgentGroup;
  status: AgentStatus;
  plan?: string;
  act?: string;
  observe?: string;
  reflect?: string;
  lastTool?: string;
  steps: number;
  errors: number;
  /** Set when the agent enters running/tool state (for elapsed display). */
  activeSinceMs?: number;
  /** Last time any event touched this agent (drives the liveline timer). */
  lastSeenAtMs?: number;
  /** Accumulated active working time across runs (ms). */
  totalActiveMs: number;
  /** Number of tool calls attributed to this agent. */
  toolRuns: number;
  /** Number of artifacts produced while this agent was active. */
  artifactCount: number;
};

/** Total working time including the in-flight active period. */
export function agentWorkMs(agent: AgentView): number {
  return agent.totalActiveMs + (agent.activeSinceMs ? Date.now() - agent.activeSinceMs : 0);
}

/** Transition agent status, accounting active working time at `atMs`. */
function setAgentStatus(agent: AgentView, status: AgentStatus, atMs: number): void {
  const wasActive = agent.status === "running" || agent.status === "tool";
  const isActive = status === "running" || status === "tool";
  if (wasActive && !isActive && agent.activeSinceMs) {
    agent.totalActiveMs += Math.max(0, atMs - agent.activeSinceMs);
    agent.activeSinceMs = undefined;
  } else if (!wasActive && isActive && !agent.activeSinceMs) {
    agent.activeSinceMs = atMs;
  }
  agent.status = status;
  agent.lastSeenAtMs = atMs;
}

/**
 * Pipeline roles (e.g. review) emit plan/act without an `agent.started`, so
 * the previous agent would stay "running" forever. Retire it on handover.
 */
function retirePreviousAgent(state: ConsoleState, nextKey: string, atMs: number): void {
  if (!state.lastAgentId || state.lastAgentId === nextKey) return;
  const previous = state.agents.get(state.lastAgentId);
  if (previous && (previous.status === "running" || previous.status === "tool")) {
    setAgentStatus(previous, "done", atMs);
  }
}

export type ToolCallView = {
  id: string;
  toolName: string;
  /** One-line summary of the call args (command / file path / …). */
  summary?: string;
  agentId?: string;
  status: "running" | "ok" | "failed";
  output?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
};

export type TimelineKind =
  | "status"
  | "taizi"
  | "agent"
  | "reason"
  | "tool"
  | "tool_ok"
  | "tool_err"
  /** bash/shell rejected by opencode so OneCompany can run it in governed sandbox */
  | "tool_redirect"
  | "gate"
  | "gate_ok"
  | "test"
  | "question"
  | "user"
  | "deploy"
  | "artifact"
  | "error"
  | "info";

export type TodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled" | string;
  priority?: string;
};

export type TimelineEntry = {
  seq: number;
  at: string;
  kind: TimelineKind;
  tag: string;
  agent?: string;
  /** Tool name for tool / tool_ok / tool_err entries. */
  tool?: string;
  /** Tool call id — lets the result merge into the started entry in place. */
  toolCallId?: string;
  /** One-line summary of the tool call args (command / file path / …). */
  toolSummary?: string;
  /** Consecutive identical tool calls collapse into one entry (×N). */
  repeat?: number;
  /** Taizi dispatch action (e.g. taizi.research, project.pause). */
  metaAction?: string;
  text: string;
  /** Set for live entries: drives the typewriter reveal animation. */
  bornAtMs?: number;
};

export type ComposerMode =
  | "requirement"
  | "question_round"
  | "gate_decision"
  | "gate_custom"
  | "deployment_url"
  | "change_request"
  | "read_only"
  | "paused";

export type ComposerState = {
  mode: ComposerMode;
  reason: string;
  input: string;
  gateId?: string;
  gateType?: string;
  gateOptions: string[];
  gateCursor: number;
  questions: PendingQuestion[];
  /** Parallel draft answers — one slot per question; supports back-navigation. */
  draftAnswers: string[];
  questionIndex: number;
};

export type FocusZone = "composer" | "timeline" | "agents";
export type InspectorTab = "artifacts" | "files";

export type Notice = { text: string; kind: "info" | "error"; at: number };

export type ViewerState = {
  title: string;
  lines: string[];
  scroll: number;
  loading: boolean;
};

export type ActionDef = { key: string; label: string; id: string };

export type ConsoleState = {
  projectId: string;
  snapshot?: ConsoleSnapshot;
  agents: Map<string, AgentView>;
  timeline: TimelineEntry[];
  toolCalls: ToolCallView[];
  toolNames: Map<string, string>;
  toolSummaries: Map<string, string>;
  artifacts: string[];
  lastAgentId?: string;
  lastSeq: number;
  sseConnected: boolean;
  focus: FocusZone;
  timelineScroll: number;
  agentCursor: number;
  inspectorAgentId?: string;
  composer: ComposerState;
  busy: Set<string>;
  notice?: Notice;
  startedAt: number;
  seededRequirement: boolean;
  /** Timestamp of the most recent event (for "no news for Xs" display). */
  lastEventAtMs: number;
  /** Optimistic in-flight hint shown in the composer until the workflow reacts. */
  pendingHint?: string;
  /** Fullscreen file viewer overlay (artifact contents). */
  viewer?: ViewerState;
  /** False during the initial history replay; live entries animate after this. */
  hydratedOnce: boolean;
  /**
   * Gates the user already resolved locally. Server keeps the gate row "open"
   * while the resumed workflow is still running, so snapshot polls would
   * otherwise resurrect the gate card after the optimistic removal.
   */
  dismissedGateIds: Set<string>;
  /** Question-round key (joined questions) already answered locally. */
  answeredQuestionsKey?: string;
  /** End timestamp of the last queued typewriter reveal (sequential streaming). */
  revealCursorMs: number;
  /**
   * User messages already echoed locally; the matching `user.interjection`
   * SSE event is skipped once so the line doesn't render twice.
   */
  localUserEchoes: Set<string>;
  /** Latest agent todo list (from todowrite tool output). */
  todos: TodoItem[];
  /** Auto-approve dangerous_operation gates (with visible warning). */
  yoloMode: boolean;
  /**
   * Live token-stream draft (agent.stream_delta bypass channel): the text the
   * model is producing right now. Rendered as a growing block at the bottom of
   * the stream; replaced by the persisted entry once the generation settles.
   */
  liveDraft?: LiveDraft;
  inspectorTab: InspectorTab;
  repoFiles: string[];
};

export type LiveDraft = {
  agentId: string;
  agentName: string;
  streamId: string;
  text: string;
  charCount: number;
  /** Last update — render hides drafts that stopped updating (stale). */
  atMs: number;
};

/** Typewriter speed; mirrored by the renderer. */
export const REVEAL_CPS = 100;

const MAX_TIMELINE = 500;
const MAX_TOOLCALLS = 120;

/* ------------------------------------------------------------------ */
/* Construction                                                         */
/* ------------------------------------------------------------------ */

export function createConsoleState(projectId: string): ConsoleState {
  const agents = new Map<string, AgentView>();
  for (const entry of AGENT_CATALOG) {
    agents.set(entry.id, {
      ...entry,
      status: "idle",
      steps: 0,
      errors: 0,
      totalActiveMs: 0,
      toolRuns: 0,
      artifactCount: 0,
    });
  }
  return {
    projectId,
    agents,
    timeline: [],
    toolCalls: [],
    toolNames: new Map(),
    toolSummaries: new Map(),
    artifacts: [],
    lastSeq: 0,
    sseConnected: false,
    focus: "composer",
    timelineScroll: 0,
    agentCursor: 0,
    composer: emptyComposer("read_only", "Loading project…"),
    busy: new Set(),
    startedAt: Date.now(),
    seededRequirement: false,
    lastEventAtMs: Date.now(),
    hydratedOnce: false,
    dismissedGateIds: new Set(),
    revealCursorMs: 0,
    localUserEchoes: new Set(),
    todos: [],
    yoloMode: false,
    inspectorTab: "artifacts",
    repoFiles: [],
  };
}

function emptyComposer(mode: ComposerMode, reason: string): ComposerState {
  return {
    mode,
    reason,
    input: "",
    gateOptions: [],
    gateCursor: 0,
    questions: [],
    draftAnswers: [],
    questionIndex: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Timeline helpers                                                     */
/* ------------------------------------------------------------------ */

function clock(timestamp?: string): string {
  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toLocaleTimeString("en-GB", { hour12: false })
    : date.toLocaleTimeString("en-GB", { hour12: false });
}

function pushTimeline(
  state: ConsoleState,
  entry: {
    seq?: number;
    at?: string;
    kind: TimelineKind;
    tag: string;
    agent?: string;
    tool?: string;
    toolCallId?: string;
    toolSummary?: string;
    metaAction?: string;
    text: string;
  },
): void {
  state.timeline.push({
    seq: entry.seq ?? state.lastSeq,
    at: entry.at ?? clock(),
    kind: entry.kind,
    tag: entry.tag,
    agent: entry.agent,
    tool: entry.tool,
    toolCallId: entry.toolCallId,
    toolSummary: entry.toolSummary,
    metaAction: entry.metaAction,
    text: entry.text,
    bornAtMs: nextBornAt(state, entry.kind, entry.text),
  });
  if (state.timeline.length > MAX_TIMELINE) {
    state.timeline.splice(0, state.timeline.length - MAX_TIMELINE);
  }
}

/**
 * Sequential typewriter schedule: user input is echoed instantly; agent/system
 * text starts typing only after the previous queued entry finished.
 */
function nextBornAt(state: ConsoleState, kind: TimelineKind, text: string): number | undefined {
  if (!state.hydratedOnce || kind === "user" || kind === "taizi") return undefined;
  const now = Date.now();
  // If the backlog grew too long (event burst), fast-forward instead of lagging.
  if (state.revealCursorMs - now > 6_000) state.revealCursorMs = now;
  const bornAtMs = Math.max(now, state.revealCursorMs);
  const durationMs = Math.min(4_000, ([...text].length / REVEAL_CPS) * 1000);
  state.revealCursorMs = bornAtMs + durationMs;
  return bornAtMs;
}

/** Merge a tool result into its "started" entry (one line per tool call). */
function settleToolEntry(
  state: ConsoleState,
  toolCallId: string,
  kind: "tool_ok" | "tool_err" | "tool_redirect",
  text: string,
): boolean {
  for (let i = state.timeline.length - 1; i >= 0; i -= 1) {
    const entry = state.timeline[i]!;
    if (entry.kind === "tool" && entry.toolCallId === toolCallId) {
      entry.kind = kind;
      entry.tag =
        kind === "tool_ok" ? "OK" : kind === "tool_redirect" ? "GOV" : "FAIL";
      entry.text = text;
      // Keep the original bornAtMs: the title line is already on screen, only
      // the output snippet pops in (no re-queued typewriter for merged lines).
      return true;
    }
  }
  return false;
}

function isGovernedRedirect(toolName: string, error: string): boolean {
  return (
    (toolName === "bash" || toolName === "shell") &&
    /rejected permission/i.test(error)
  );
}

/** Parse opencode todowrite JSON output into the live todo panel. */
function applyTodoUpdate(state: ConsoleState, toolName: string, output: string): void {
  const key = toolName.toLowerCase();
  if (key !== "todowrite" && key !== "todo") return;
  const trimmed = output.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { todos?: unknown }).todos)
        ? (parsed as { todos: unknown[] }).todos
        : null;
    if (!list) return;
    state.todos = list
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        content: String(item.content ?? item.title ?? "").trim(),
        status: String(item.status ?? "pending"),
        priority: typeof item.priority === "string" ? item.priority : undefined,
      }))
      .filter((item) => item.content.length > 0);

    // Once every item is settled, the list stops being "live": archive it into
    // the stream (it scrolls up with history) and unpin the panel.
    const allDone =
      state.todos.length > 0 &&
      state.todos.every((item) => item.status === "completed" || item.status === "cancelled");
    if (allDone) {
      const done = state.todos.filter((item) => item.status === "completed").length;
      pushTimeline(state, {
        kind: "info",
        tag: "TODO",
        text: `任务清单完成（${done}/${state.todos.length}）：${state.todos
          .map((item) => item.content)
          .join("；")}`,
      });
      state.todos = [];
    }
  } catch {
    // Non-JSON todo output — ignore.
  }
}

/** Locally echo a user-authored message into the stream (Claude-Code style). */
export function pushUserMessage(state: ConsoleState, text: string): void {
  pushTimeline(state, { kind: "user", tag: "USER", text });
}

function normalizeTaiziReply(reply: string): string {
  return reply.replace(/\r\n/g, "\n").trim();
}

function isDuplicateTaiziReply(state: ConsoleState, reply: string): boolean {
  for (let i = state.timeline.length - 1; i >= 0 && i >= state.timeline.length - 4; i -= 1) {
    const entry = state.timeline[i]!;
    if (entry.kind === "taizi" && entry.text === reply) return true;
  }
  return false;
}

/** Full Taizi answer in the center stream (not truncated). */
export function pushTaiziReply(
  state: ConsoleState,
  reply: string,
  metaAction?: string,
  opts?: { seq?: number; at?: string },
): void {
  const text = normalizeTaiziReply(reply);
  if (!text || isDuplicateTaiziReply(state, text)) return;
  pushTimeline(state, {
    seq: opts?.seq,
    at: opts?.at,
    kind: "taizi",
    tag: "太子",
    text,
    metaAction: metaAction && metaAction !== "noop" ? metaAction : undefined,
  });
}

export function pushNotice(state: ConsoleState, kind: Notice["kind"], text: string): void {
  state.notice = { text, kind, at: Date.now() };
  if (kind === "error") {
    pushTimeline(state, { kind: "error", tag: "ERR", text });
  }
}

function addArtifact(state: ConsoleState, path: string): void {
  if (!state.artifacts.includes(path)) {
    state.artifacts.push(path);
    if (state.artifacts.length > 20) state.artifacts.shift();
  }
}

function ensureAgent(state: ConsoleState, rawId: string): AgentView {
  const key = normalizeAgentId(rawId) ?? rawId;
  let agent = state.agents.get(key);
  if (!agent) {
    const entry = findAgent(key);
    agent = {
      id: key,
      name: entry?.name ?? agentDisplayName(key),
      role: entry?.role ?? "—",
      description: entry?.description ?? "",
      capabilities: entry?.capabilities ?? [],
      group: entry?.group ?? "development",
      status: "idle",
      steps: 0,
      errors: 0,
      totalActiveMs: 0,
      toolRuns: 0,
      artifactCount: 0,
    };
    state.agents.set(key, agent);
  }
  return agent;
}

/* ------------------------------------------------------------------ */
/* Event application                                                    */
/* ------------------------------------------------------------------ */

const REASON_TAG: Record<string, string> = {
  "agent.plan": "PLAN",
  "agent.act": "ACT",
  "agent.observe": "OBSRV",
  "agent.reflect": "REFLT",
};

export function applyEnvelope(state: ConsoleState, envelope: EventEnvelope): boolean {
  // Ephemeral bypass channel (seq=0): live token-stream snapshot. Updates the
  // draft block only — never the timeline, never the replay cursor.
  if (envelope.payload.type === "agent.stream_delta") {
    const payload = envelope.payload;
    if (payload.done === true) {
      state.liveDraft = undefined;
      return true;
    }
    const text = typeof payload.text === "string" ? payload.text : "";
    if (!text) return false;
    const agentId = String(payload.agentId ?? envelope.agentId ?? state.lastAgentId ?? "agent");
    const agent = ensureAgent(state, agentId);
    state.liveDraft = {
      agentId: agent.id,
      agentName: agent.name,
      streamId: String(payload.streamId ?? "stream"),
      text,
      charCount: typeof payload.charCount === "number" ? payload.charCount : text.length,
      atMs: Date.now(),
    };
    if (agent.status !== "tool") setAgentStatus(agent, "running", Date.now());
    state.lastAgentId = agent.id;
    state.lastEventAtMs = Date.now();
    return true;
  }

  if (envelope.seq <= state.lastSeq) return false;
  state.lastSeq = envelope.seq;
  state.lastEventAtMs = Date.now();

  // Any persisted event from the draft's agent means the generation turn
  // settled (tool call started / summary landed) — retire the draft. The next
  // delta (≤250ms away) recreates it if the model is still talking.
  if (
    state.liveDraft &&
    envelope.payload.type !== "agent.progress" &&
    normalizeAgentId(String(envelope.payload.agentId ?? envelope.agentId ?? "")) ===
      state.liveDraft.agentId
  ) {
    state.liveDraft = undefined;
  }

  const payload = envelope.payload;
  const type = payload.type;
  const at = clock(envelope.timestamp);
  const seq = envelope.seq;
  const parsedTs = new Date(envelope.timestamp).getTime();
  /** Event time for work-time accounting (history replay uses real timestamps). */
  const tMs = Number.isNaN(parsedTs) ? Date.now() : parsedTs;

  // Visible workflow progress invalidates any optimistic in-flight hint.
  if (type === "project.status_changed" || type === "human_gate.created" || type === "agent.started") {
    state.pendingHint = undefined;
  }

  switch (type) {
    case "project.created":
      pushTimeline(state, { seq, at, kind: "status", tag: "INIT", text: `project created: ${String(payload.name ?? "")}` });
      break;

    case "project.status_changed": {
      const status = String(payload.status ?? "");
      if (state.snapshot) state.snapshot.project.status = status;
      pushTimeline(state, { seq, at, kind: "status", tag: "PHASE", text: `status → ${status}` });
      break;
    }

    case "agent.started": {
      const agentId = String(payload.agentId ?? envelope.agentId ?? "agent");
      const key = normalizeAgentId(agentId) ?? agentId;
      retirePreviousAgent(state, key, tMs);
      const agent = ensureAgent(state, agentId);
      setAgentStatus(agent, "running", tMs);
      state.lastAgentId = agent.id;
      pushTimeline(state, { seq, at, kind: "agent", tag: "AGENT", agent: agent.name, text: `${agent.name} started` });
      break;
    }

    case "agent.progress": {
      // Ephemeral streaming progress: refresh the live status line only —
      // never the timeline (a long generation would flood it).
      const agentId = String(payload.agentId ?? envelope.agentId ?? state.lastAgentId ?? "agent");
      const agent = ensureAgent(state, agentId);
      const summary = typeof payload.summary === "string" ? payload.summary : "";
      if (summary && agent.status !== "tool") {
        agent.act = summary;
        setAgentStatus(agent, "running", tMs);
      }
      state.lastAgentId = agent.id;
      break;
    }

    case "agent.plan":
    case "agent.act":
    case "agent.observe":
    case "agent.reflect": {
      const agentId = String(payload.agentId ?? envelope.agentId ?? state.lastAgentId ?? "agent");
      retirePreviousAgent(state, normalizeAgentId(agentId) ?? agentId, tMs);
      const agent = ensureAgent(state, agentId);
      const summary = typeof payload.summary === "string" ? payload.summary : "";
      if (type === "agent.plan") agent.plan = summary;
      if (type === "agent.act") agent.act = summary;
      if (type === "agent.observe") agent.observe = summary;
      if (type === "agent.reflect") {
        agent.reflect = summary;
        agent.steps += 1;
        setAgentStatus(agent, "done", tMs);
      } else if (agent.status !== "tool") {
        setAgentStatus(agent, "running", tMs);
      }
      state.lastAgentId = agent.id;
      pushTimeline(state, {
        seq,
        at,
        kind: "reason",
        tag: REASON_TAG[type] ?? "THINK",
        agent: agent.name,
        text: summary || `(${type.replace("agent.", "")})`,
      });
      break;
    }

    case "agent.error": {
      const agentId = String(payload.agentId ?? envelope.agentId ?? state.lastAgentId ?? "agent");
      const agent = ensureAgent(state, agentId);
      setAgentStatus(agent, "failed", tMs);
      agent.errors += 1;
      pushTimeline(state, {
        seq,
        at,
        kind: "error",
        tag: "ERR",
        agent: agent.name,
        text: String(payload.message ?? "agent error"),
      });
      break;
    }

    case "run.failed": {
      const rawAgentId = String(payload.agentId ?? "");
      const agentName = agentDisplayName(rawAgentId);
      if (rawAgentId) {
        const agent = ensureAgent(state, rawAgentId);
        setAgentStatus(agent, "failed", tMs);
        agent.errors += 1;
      }
      pushTimeline(state, {
        seq,
        at,
        kind: "error",
        tag: "FAIL",
        agent: agentName,
        text: String(payload.reason ?? "run failed"),
      });
      break;
    }

    case "tool_call.started": {
      const toolCallId = String(payload.toolCallId ?? `tc-${seq}`);
      const toolName = String(payload.toolName ?? "tool");
      const summary = typeof payload.summary === "string" ? payload.summary : undefined;
      state.toolNames.set(toolCallId, toolName);
      if (summary) state.toolSummaries.set(toolCallId, summary);
      const agent = state.lastAgentId ? state.agents.get(state.lastAgentId) : undefined;
      if (agent) {
        setAgentStatus(agent, "tool", tMs);
        agent.lastTool = toolName;
        agent.toolRuns += 1;
      }
      state.toolCalls.push({
        id: toolCallId,
        toolName,
        summary,
        agentId: agent?.id,
        status: "running",
        startedAt: Date.now(),
      });
      if (state.toolCalls.length > MAX_TOOLCALLS) state.toolCalls.shift();
      // Consecutive identical calls (same tool + same args summary, e.g. a
      // retried command) collapse into the previous entry instead of stacking.
      const last = state.timeline.at(-1);
      if (
        last &&
        (last.kind === "tool" || last.kind === "tool_ok" || last.kind === "tool_err" || last.kind === "tool_redirect") &&
        last.tool === toolName &&
        Boolean(summary) &&
        last.toolSummary === summary
      ) {
        last.kind = "tool";
        last.tag = "TOOL";
        last.toolCallId = toolCallId;
        last.repeat = (last.repeat ?? 1) + 1;
        last.text = "";
        break;
      }
      pushTimeline(state, {
        seq,
        at,
        kind: "tool",
        tag: "TOOL",
        agent: agent?.name,
        tool: toolName,
        toolCallId,
        toolSummary: summary,
        text: "",
      });
      break;
    }

    case "tool_call.output": {
      const toolCallId = String(payload.toolCallId ?? "");
      const toolName = state.toolNames.get(toolCallId) ?? "tool";
      const output = typeof payload.output === "string" ? payload.output : "";
      const record =
        state.toolCalls.find((tc) => tc.id === toolCallId) ?? state.toolCalls.at(-1);
      if (record) {
        record.status = "ok";
        record.output = output;
        record.endedAt = Date.now();
      }
      const agent = state.lastAgentId ? state.agents.get(state.lastAgentId) : undefined;
      if (agent && agent.status === "tool") setAgentStatus(agent, "running", tMs);
      applyTodoUpdate(state, toolName, output);
      if (!settleToolEntry(state, toolCallId, "tool_ok", oneLine(output, 200))) {
        pushTimeline(state, {
          seq,
          at,
          kind: "tool_ok",
          tag: "OK",
          agent: agent?.name,
          tool: toolName,
          toolSummary: state.toolSummaries.get(toolCallId),
          text: oneLine(output, 200),
        });
      }
      break;
    }

    case "tool_call.failed": {
      const toolCallId = String(payload.toolCallId ?? "");
      const toolName = state.toolNames.get(toolCallId) ?? "tool";
      const error = String(payload.error ?? "failed");
      const record = state.toolCalls.find((tc) => tc.id === toolCallId);
      if (record) {
        record.status = "failed";
        record.error = error;
        record.endedAt = Date.now();
      }
      const agent = state.lastAgentId ? state.agents.get(state.lastAgentId) : undefined;
      const governed = isGovernedRedirect(toolName, error);
      if (agent && !governed) {
        agent.errors += 1;
        if (agent.status === "tool") setAgentStatus(agent, "running", tMs);
      } else if (agent && agent.status === "tool") {
        setAgentStatus(agent, "running", tMs);
      }
      const kind = governed ? "tool_redirect" : "tool_err";
      const detail = governed
        ? "已转交受治理执行（非失败，OneCompany 在沙箱中代为运行）"
        : oneLine(error, 200);
      if (!settleToolEntry(state, toolCallId, kind, detail)) {
        pushTimeline(state, {
          seq,
          at,
          kind,
          tag: governed ? "GOV" : "FAIL",
          agent: agent?.name,
          tool: toolName,
          toolSummary: state.toolSummaries.get(toolCallId),
          text: detail,
        });
      }
      break;
    }

    case "human_gate.created": {
      const gateId = String(payload.gateId ?? "");
      const gateType = String(payload.gateType ?? "gate");
      if (
        state.snapshot &&
        !state.dismissedGateIds.has(gateId) &&
        !state.snapshot.openGates.some((gate) => gate.id === gateId)
      ) {
        state.snapshot.openGates.push({
          id: gateId,
          gateType,
          status: "open",
          options: gateDefinition(gateType).options,
          decision: null,
        });
      }
      if (state.lastAgentId) {
        const agent = state.agents.get(state.lastAgentId);
        if (agent && (agent.status === "running" || agent.status === "tool")) {
          setAgentStatus(agent, "blocked", tMs);
        }
      }
      pushTimeline(state, {
        seq,
        at,
        kind: "gate",
        tag: "GATE",
        text: `${gateDefinition(gateType).title} — 等待你的决定`,
      });
      break;
    }

    case "human_gate.resolved": {
      const gateId = String(payload.gateId ?? "");
      state.dismissedGateIds.add(gateId);
      if (state.snapshot) {
        state.snapshot.openGates = state.snapshot.openGates.filter((gate) => gate.id !== gateId);
      }
      for (const agent of state.agents.values()) {
        if (agent.status === "blocked") agent.status = "waiting";
      }
      pushTimeline(state, {
        seq,
        at,
        kind: "gate_ok",
        tag: "GATE",
        text: `gate resolved → ${String(payload.decision ?? "?")}`,
      });
      break;
    }

    case "change_request.created":
      pushTimeline(state, {
        seq,
        at,
        kind: "user",
        tag: "USER",
        text: `change request: ${oneLine(String(payload.summary ?? ""), 140)}`,
      });
      break;

    case "user.interjection": {
      const message = String(payload.message ?? "");
      // Skip the echo of a message this client just sent.
      if (state.localUserEchoes.delete(message)) break;
      pushTimeline(state, {
        seq,
        at,
        kind: "user",
        tag: "USER",
        text: oneLine(message, 200),
      });
      break;
    }

    case "taizi.routed": {
      const reply = String(payload.reply ?? "");
      const action = String(payload.action ?? "noop");
      const message = String(payload.message ?? "");
      if (message && !state.localUserEchoes.delete(message)) {
        pushTimeline(state, { seq, at, kind: "user", tag: "USER", text: oneLine(message, 200) });
      }
      if (reply) {
        pushTaiziReply(state, reply, action, { seq, at });
      }
      break;
    }

    case "change_request.resolved":
      pushTimeline(state, {
        seq,
        at,
        kind: "status",
        tag: "CR",
        text: `change request resolved → ${String(payload.decision ?? "?")}`,
      });
      break;

    case "test.result": {
      const status = String(payload.status ?? "?");
      pushTimeline(state, {
        seq,
        at,
        kind: status === "passed" ? "test" : "error",
        tag: "TEST",
        text: `${String(payload.suite ?? "suite")} → ${status}`,
      });
      break;
    }

    case "diff.created":
      pushTimeline(state, {
        seq,
        at,
        kind: "artifact",
        tag: "DIFF",
        text: oneLine(String(payload.summary ?? "diff created"), 140),
      });
      break;

    case "artifact.created": {
      const path = String(payload.path ?? payload.artifactId ?? "artifact");
      addArtifact(state, path);
      if (state.lastAgentId) {
        const agent = state.agents.get(state.lastAgentId);
        if (agent) agent.artifactCount += 1;
      }
      pushTimeline(state, { seq, at, kind: "artifact", tag: "FILE", text: path });
      break;
    }

    case "deployment.started":
      pushTimeline(state, { seq, at, kind: "deploy", tag: "DEPLY", text: "deployment started" });
      break;

    case "deployment.url_confirmed":
      pushTimeline(state, {
        seq,
        at,
        kind: "deploy",
        tag: "DEPLY",
        text: `url confirmed: ${String(payload.url ?? "")}`,
      });
      break;

    case "deployment.completed":
      pushTimeline(state, {
        seq,
        at,
        kind: "deploy",
        tag: "DEPLY",
        text: `deployment completed${payload.url ? `: ${String(payload.url)}` : ""}`,
      });
      break;

    case "delivery.report_generated": {
      const path = String(payload.artifactPath ?? "");
      if (path) addArtifact(state, path);
      pushTimeline(state, { seq, at, kind: "artifact", tag: "RPORT", text: `delivery report: ${path}` });
      break;
    }

    case "environment.missing_key":
      pushTimeline(state, {
        seq,
        at,
        kind: "error",
        tag: "ENV",
        text: `${String(payload.keyName ?? "key")}: ${String(payload.message ?? "missing")}`,
      });
      break;

    default:
      pushTimeline(state, { seq, at, kind: "info", tag: "INFO", text: type });
  }

  refreshComposer(state);
  return true;
}

/* ------------------------------------------------------------------ */
/* Snapshot hydration                                                   */
/* ------------------------------------------------------------------ */

export function hydrateSnapshot(state: ConsoleState, snapshot: ConsoleSnapshot): void {
  // Gates resolved locally stay "open" server-side until the resumed workflow
  // yields; keep them hidden so the card does not flicker back.
  snapshot.openGates = snapshot.openGates.filter((gate) => !state.dismissedGateIds.has(gate.id));

  // Same for an already-answered question round still pending server-side.
  const pending = snapshot.requirement?.pendingQuestions;
  if (pending?.length) {
    const key = pending.map((q) => q.question).join("|");
    if (state.answeredQuestionsKey === key) {
      snapshot.requirement!.pendingQuestions = [];
    } else {
      state.answeredQuestionsKey = undefined;
    }
  }

  state.snapshot = snapshot;

  if (!state.seededRequirement && snapshot.requirement?.rawRequirement) {
    state.seededRequirement = true;
    state.timeline.unshift({
      seq: 0,
      at: clock(snapshot.project.createdAt),
      kind: "user",
      tag: "USER",
      text: snapshot.requirement.rawRequirement,
    });
  }

  for (const envelope of [...snapshot.events].sort((a, b) => a.seq - b.seq)) {
    applyEnvelope(state, envelope);
  }
  state.lastSeq = Math.max(state.lastSeq, snapshot.lastSeq);

  // Group-level waiting hint for agents that have not produced events.
  const group = snapshot.phase.activeGroup.toLowerCase();
  const activeGroup: AgentGroup | undefined = group.includes("requirement")
    ? "requirement"
    : group.includes("development")
      ? "development"
      : undefined;
  for (const agent of state.agents.values()) {
    if (agent.status === "idle" || agent.status === "waiting") {
      agent.status = activeGroup && agent.group === activeGroup ? "waiting" : "idle";
    }
  }

  state.hydratedOnce = true;
  refreshComposer(state);
}

/* ------------------------------------------------------------------ */
/* Composer derivation                                                  */
/* ------------------------------------------------------------------ */

function computeComposer(state: ConsoleState): ComposerState {
  const snapshot = state.snapshot;
  if (!snapshot) return emptyComposer("read_only", "Loading project…");

  if (state.pendingHint) {
    return emptyComposer("read_only", state.pendingHint);
  }

  const status = snapshot.project.status;

  if (status === "Paused") {
    return emptyComposer(
      "paused",
      snapshot.pausedFrom
        ? `已暂停 — 输入「继续」回到 ${snapshot.pausedFrom}（或 ^P）`
        : "已暂停 — 输入「继续」恢复（或 ^P）",
    );
  }

  if (status === "Delivered" || status === "Failed") {
    return emptyComposer(
      "read_only",
      status === "Delivered" ? "Project delivered. 🎉" : "Project failed — see timeline for details.",
    );
  }

  const gate = snapshot.openGates[0];
  if (gate) {
    const def = gateDefinition(gate.gateType);
    const composer = emptyComposer(
      gate.gateType === "deployment" ? "deployment_url" : "gate_decision",
      `${def.title} — ${def.description}`,
    );
    composer.gateId = gate.id;
    composer.gateType = gate.gateType;
    composer.gateOptions = gate.options.length ? gate.options : def.options;
    return composer;
  }

  if (status === "Asking Questions" && snapshot.requirement?.pendingQuestions?.length) {
    const composer = emptyComposer(
      "question_round",
      "Agents need clarification — answer each question, Enter to confirm.",
    );
    composer.questions = snapshot.requirement.pendingQuestions;
    composer.draftAnswers = snapshot.requirement.pendingQuestions.map(() => "");
    composer.questionIndex = 0;
    return composer;
  }

  if (status === "Draft Requirement") {
    return emptyComposer("requirement", "Describe the product requirement, Enter to start the pipeline.");
  }

  if (status === "PRD Ready") {
    return emptyComposer("read_only", "PRD 已就绪 — 点「启动开发」、按 d，或直接输入「开始开发」。");
  }

  if (status === "Developing" || status === "Testing") {
    return emptyComposer(
      "change_request",
      `${status} — 输入新信息可随时插话给 Agent（! 开头会立即打断当前操作）`,
    );
  }

  return emptyComposer(
    "read_only",
    `${status} — 可直接输入指令（继续 / 暂停 / 加一个xxx功能 / 导出 / 进度…）`,
  );
}

/** Recompute composer, preserving in-progress user input when context is unchanged. */
export function refreshComposer(state: ConsoleState): void {
  const next = computeComposer(state);
  const current = state.composer;

  const sameGate = current.gateId === next.gateId;
  const sameQuestions =
    current.questions.length === next.questions.length &&
    current.questions.every((q, i) => q.question === next.questions[i]?.question);

  // User explicitly entered custom-text entry for the still-open gate: keep it.
  if (current.mode === "gate_custom" && next.mode === "gate_decision" && sameGate) {
    current.reason = next.reason;
    current.gateOptions = next.gateOptions;
    return;
  }

  if (current.mode === next.mode && sameGate && sameQuestions) {
    current.reason = next.reason;
    current.gateType = next.gateType;
    current.gateOptions = next.gateOptions;
    current.gateCursor = Math.min(current.gateCursor, Math.max(0, next.gateOptions.length - 1));
    if (current.draftAnswers.length !== current.questions.length) {
      current.draftAnswers = current.questions.map((_, i) => current.draftAnswers[i] ?? "");
    }
    current.questionIndex = Math.min(current.questionIndex, Math.max(0, current.questions.length - 1));
    return;
  }

  state.composer = next;
}

/* ------------------------------------------------------------------ */
/* Contextual actions                                                   */
/* ------------------------------------------------------------------ */

export function deriveActions(state: ConsoleState): ActionDef[] {
  const actions: ActionDef[] = [];
  const status = state.snapshot?.project.status;

  if (status === "PRD Ready") {
    actions.push({ key: "d", label: "start development", id: "start_dev" });
  }
  // Developing but silent with no gate: the slice loop likely died with a
  // previous API process — offer to resume it from the persisted session.
  // A running tool call (long test run, build…) is live work, not a stall;
  // only a very long silence overrides that signal.
  const idleMs = Date.now() - state.lastEventAtMs;
  const hasRunningTool = state.toolCalls.some((tc) => tc.status === "running");
  if (
    status === "Developing" &&
    !state.snapshot?.openGates.length &&
    state.busy.size === 0 &&
    ((idleMs > 45_000 && !hasRunningTool) || idleMs > 300_000)
  ) {
    actions.push({ key: "d", label: "恢复开发（续跑切片）", id: "start_dev" });
  }
  if (status === "Testing" && (state.snapshot?.testing?.suiteTotal ?? 0) === 0) {
    actions.push({ key: "t", label: "run tests + deploy", id: "start_testing" });
  }
  if (status === "Delivered") {
    actions.push({ key: "g", label: "delivery report", id: "delivery_report" });
  }
  if (
    status &&
    !["Draft Requirement", "Failed"].includes(status)
  ) {
    actions.push({ key: "e", label: "导出提交包", id: "export_submission" });
  }
  if (state.composer.mode === "question_round") {
    actions.push({ key: "k", label: "跳过澄清", id: "skip_clarification" });
    const allAnswered =
      state.composer.draftAnswers.length === state.composer.questions.length &&
      state.composer.draftAnswers.every((answer) => answer.trim().length > 0);
    if (allAnswered) {
      actions.push({ key: "s", label: "提交本轮答案", id: "submit_answers" });
    }
  }
  if (status === "Paused") {
    actions.push({ key: "p", label: "resume", id: "pause_resume" });
  } else if (status && status !== "Delivered" && status !== "Failed") {
    actions.push({ key: "p", label: "pause", id: "pause_resume" });
  }
  actions.push({ key: "r", label: "refresh", id: "refresh" });
  actions.push({
    key: "y",
    label: state.yoloMode ? "关闭 YOLO" : "YOLO 模式",
    id: "toggle_yolo",
  });
  return actions;
}

/** True when the composer is consuming printable keystrokes. */
export function isTyping(state: ConsoleState): boolean {
  if (state.focus !== "composer") return false;
  // Taizi 全程接收输入：除门禁选项导航外，所有模式都可打字。
  return state.composer.mode !== "gate_decision";
}
