/**
 * Console view-model types. Ported verbatim from apps/tui/src/store.ts.
 *
 * The store keeps a single mutable ConsoleState (held in a useRef on the client),
 * mirroring the TUI's architecture — applyEnvelope / hydrate / computeComposer
 * mutate fields in place, and a markDirty coalescer triggers re-renders.
 */

import type { AgentGroup } from "../lib/catalog/agents";
import type { TuiTheme } from "../lib/theme/palette";
import type {
  ConsoleSnapshot,
  EventEnvelope,
  GateInfo,
  PendingQuestion,
} from "../lib/api/types";

export type AgentStatus = "idle" | "waiting" | "running" | "tool" | "blocked" | "done" | "failed";

export type AgentPaorEntry = {
  phase: "plan" | "act" | "observe" | "reflect" | "progress";
  text: string;
  at: string;
  seq?: number;
};

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
  /** Append-only PAOR / progress log — survives agent switches and later overwrites. */
  paorLog: AgentPaorEntry[];
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
  | "info"
  /** Persisted agent.start prompt — shown in agent focus stream only. */
  | "prompt";

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
  /** Codex turn grouping — user message opens a turn. */
  turnId?: string;
  /** Execution activities within a turn share this id. */
  activityGroupId?: string;
  /** Main thread or agent id for sub-thread filtering. */
  threadId?: string;
  importance?: "primary" | "execution" | "critical";
  defaultExpanded?: boolean;
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
  /** When gate_custom collects text for a non-custom option (e.g. reject_and_redo). */
  pendingGateDecision?: string;
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

export type ActionDef = { key?: string; label: string; id: string };

export type LiveDraft = {
  agentId: string;
  agentName: string;
  streamId: string;
  text: string;
  charCount: number;
  /** Last update — render hides drafts that stopped updating (stale). */
  atMs: number;
};

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
  /** When set, center stream shows only this agent's work + strongly related events. */
  timelineFocusAgentId?: string;
  /** Per-agent timeline scroll offset preserved when switching agent focus. */
  agentStreamScroll: Map<string, number>;
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
  /** Taizi panel and accent colors — dark (default) or light. */
  theme: TuiTheme;
  /**
   * Live token-stream draft (agent.stream_delta bypass channel): the text the
   * model is producing right now. Rendered as a growing block at the bottom of
   * the stream; replaced by the persisted entry once the generation settles.
   */
  liveDraft?: LiveDraft;
  inspectorTab: InspectorTab;
  repoFiles: string[];
  /** Expanded directory paths in the Files panel tree. */
  expandedFileDirs: Set<string>;
  /** Scroll offset (rows from top) for the Files panel tree. */
  fileTreeScroll: number;
  /** Monotonic turn counter for Codex-style grouping. */
  turnCounter: number;
  /** Active turn opened by the latest user message (or orphan execution). */
  currentTurnId?: string;
  /** User toggled collapsed activity groups (by turn id). */
  collapsedTurns: Set<string>;
  /** User manually expanded groups — do not auto-collapse. */
  pinnedTurns: Set<string>;
  /** Open gates from API snapshot before client dismiss filtering. */
  serverOpenGates: GateInfo[];
  /** Ctrl+P command palette (opencode-style). */
  commandPalette?: { query: string; cursor: number };
  /** Latest preview health from panel API (drives deploy / undeploy label). */
  previewReachable?: boolean;
};

export type { AgentGroup, TuiTheme, ConsoleSnapshot, EventEnvelope, GateInfo, PendingQuestion };
