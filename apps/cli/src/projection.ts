import {
  activeGroupFromLabel,
  AGENT_CATALOG,
  normalizeAgentId,
  resolveAgentDisplayName,
  resolveAgentGroup,
  resolveAgentRole,
  type AgentGroup,
} from "./agents.js";
import {
  createPhaseTimeline,
  deriveCurrentPhase,
  deriveGlobalStatus,
  parseProgressPct,
  syncPhasesFromStatus,
  type GlobalStatus,
  type PhaseId,
  type PhaseRecord,
} from "./phases.js";
import type {
  ConsoleSnapshot,
  EventDisplayContext,
  EventEnvelope,
  RenderMode,
} from "./types.js";

export type AgentRunState =
  | "IDLE"
  | "WAITING"
  | "RUNNING"
  | "TOOL_CALLING"
  | "DONE"
  | "FAILED"
  | "BLOCKED"
  | "SKIPPED";

export type ToolCallStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "RETRYING" | "SKIPPED";

export type AgentPanelState = {
  id: string;
  name: string;
  role: string;
  group: AgentGroup;
  state: AgentRunState;
  currentTask?: string;
  lastReason?: string;
  lastTool?: string;
  stepsDone: number;
  errorCount: number;
};

export type StreamKind =
  | "PHASE_START"
  | "PHASE_DONE"
  | "AGENT_START"
  | "REASON"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "AGENT_OUTPUT"
  | "VALIDATION"
  | "ERROR"
  | "RETRY"
  | "INFO"
  | "GATE"
  | "STATUS";

export type StreamEntry = {
  at: string;
  kind: StreamKind;
  text: string;
  agent?: string;
};

export type ToolCallRecord = {
  id: string;
  toolName: string;
  agent?: string;
  status: ToolCallStatus;
  inputSummary?: string;
  outputSummary?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  error?: string;
  retryCount: number;
};

export type ValidationStatus = "PENDING" | "RUNNING" | "PASS" | "FAIL" | "SKIPPED";

export type ValidationCard = {
  install: ValidationStatus;
  build: ValidationStatus;
  start: ValidationStatus;
  mainPath: ValidationStatus;
};

export type RequirementCard = {
  appName?: string;
  users: string[];
  coreObjects: string[];
  appType?: string;
  summary?: string;
  completeness?: number;
};

export type TuiViewState = {
  globalStatus: GlobalStatus;
  currentPhase: PhaseId;
  phases: PhaseRecord[];
  agents: Record<string, AgentPanelState>;
  stream: StreamEntry[];
  toolCalls: ToolCallRecord[];
  artifacts: string[];
  requirement: RequirementCard;
  validation: ValidationCard;
  activeAgentId?: string;
  activeAgentName?: string;
  progressPct: number;
  phaseLabel?: string;
  activeGroup?: string;
  blockedMessage?: string;
  lastUpdateAt: string;
  showArtifacts: boolean;
  showToolPanel: boolean;
  bootstrapped: boolean;
};

const MAX_STREAM = 200;
const MAX_TOOLS = 40;
const MAX_ARTIFACTS = 24;

function nowTime(timestamp?: string): string {
  if (timestamp) {
    try {
      return new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false });
    } catch {
      /* fall through */
    }
  }
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function truncate(text: string, max = 80): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function pushStream(view: TuiViewState, entry: Omit<StreamEntry, "at"> & { at?: string }): void {
  view.stream.push({
    at: entry.at ?? nowTime(),
    kind: entry.kind,
    text: entry.text,
    agent: entry.agent,
  });
  if (view.stream.length > MAX_STREAM) {
    view.stream.splice(0, view.stream.length - MAX_STREAM);
  }
  view.lastUpdateAt = entry.at ?? nowTime();
}

function ensureAgent(view: TuiViewState, agentId: string): AgentPanelState {
  const key = normalizeAgentId(agentId) ?? agentId;
  if (!view.agents[key]) {
    const catalog = AGENT_CATALOG.find((a) => a.id === key);
    view.agents[key] = {
      id: key,
      name: catalog?.name ?? resolveAgentDisplayName(key),
      role: catalog?.role ?? resolveAgentRole(key),
      group: catalog?.group ?? "requirement",
      state: "IDLE",
      stepsDone: 0,
      errorCount: 0,
    };
  }
  return view.agents[key]!;
}

function refreshAgentWaiting(view: TuiViewState): void {
  const active = activeGroupFromLabel(view.activeGroup);
  for (const agent of Object.values(view.agents)) {
    if (agent.state === "RUNNING" || agent.state === "TOOL_CALLING" || agent.state === "FAILED") {
      continue;
    }
    if (agent.state === "DONE" || agent.state === "BLOCKED") continue;
    if (!active) {
      agent.state = "IDLE";
      continue;
    }
    agent.state = agent.group === active ? "WAITING" : "IDLE";
  }
}

function markAgentDone(view: TuiViewState, agentId: string): void {
  const agent = ensureAgent(view, agentId);
  if (agent.state === "RUNNING" || agent.state === "TOOL_CALLING") {
    agent.state = "DONE";
    agent.stepsDone += 1;
  }
}

function inferArtifactsFromOutput(output: string): string[] {
  const paths: string[] = [];
  const patterns = [
    /(?:outputs|generated_app|src|dist|artifacts?)\/[\w./-]+\.\w+/gi,
    /[\w.-]+\.(?:json|tsx?|jsx?|md|html|css|yaml|yml)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of output.match(pattern) ?? []) {
      if (!paths.includes(match)) paths.push(match);
    }
  }
  return paths.slice(0, 5);
}

function addArtifacts(view: TuiViewState, paths: string[]): void {
  for (const path of paths) {
    if (!view.artifacts.includes(path)) {
      view.artifacts.push(path);
    }
  }
  if (view.artifacts.length > MAX_ARTIFACTS) {
    view.artifacts.splice(0, view.artifacts.length - MAX_ARTIFACTS);
  }
}

function mapTestSuiteToValidation(suite: string): keyof ValidationCard | undefined {
  const lower = suite.toLowerCase();
  if (lower.includes("install")) return "install";
  if (lower.includes("build")) return "build";
  if (lower.includes("start") || lower.includes("dev")) return "start";
  if (lower.includes("e2e") || lower.includes("main") || lower.includes("smoke")) return "mainPath";
  return "mainPath";
}

export function createTuiView(): TuiViewState {
  const agents: Record<string, AgentPanelState> = {};
  for (const entry of AGENT_CATALOG) {
    agents[entry.id] = {
      id: entry.id,
      name: entry.name,
      role: entry.role,
      group: entry.group,
      state: "IDLE",
      stepsDone: 0,
      errorCount: 0,
    };
  }
  return {
    globalStatus: "IDLE",
    currentPhase: "INIT",
    phases: createPhaseTimeline(),
    agents,
    stream: [],
    toolCalls: [],
    artifacts: [],
    requirement: { users: [], coreObjects: [] },
    validation: {
      install: "PENDING",
      build: "PENDING",
      start: "PENDING",
      mainPath: "PENDING",
    },
    progressPct: 0,
    lastUpdateAt: nowTime(),
    showArtifacts: true,
    showToolPanel: true,
    bootstrapped: false,
  };
}

export function hydrateTuiFromSnapshot(
  view: TuiViewState,
  snapshot: ConsoleSnapshot,
  mode: RenderMode,
): void {
  view.phaseLabel = snapshot.phase.label;
  view.activeGroup = snapshot.phase.activeGroup;
  view.progressPct = parseProgressPct(snapshot);
  view.currentPhase = syncPhasesFromStatus(view.phases, snapshot.project.status);
  view.globalStatus = deriveGlobalStatus(
    snapshot.project.status,
    snapshot.openGates.length > 0,
    mode,
  );

  if (snapshot.requirement) {
    const req = snapshot.requirement;
    view.requirement = {
      appName: snapshot.project.name,
      summary: req.normalizedSummary || req.rawRequirement,
      completeness: req.completenessScore,
      users: req.settledChips.filter((c) => /用户|user|hr|面试/i.test(c)).slice(0, 4),
      coreObjects: req.settledChips.filter((c) => !/用户|user|hr|面试/i.test(c)).slice(0, 6),
      appType: req.upcomingChips.find((c) => /web|app|html/i.test(c)) ?? "Web App",
    };
    if (view.requirement.coreObjects.length === 0) {
      view.requirement.coreObjects = req.settledChips.slice(0, 6);
    }
  }

  if (snapshot.testing) {
    const ratio = snapshot.testing.suiteTotal
      ? snapshot.testing.suitePassed / snapshot.testing.suiteTotal
      : 0;
    const partial = ratio > 0 && ratio < 1 ? "RUNNING" : ratio >= 1 ? "PASS" : "PENDING";
    view.validation.mainPath = partial;
    view.validation.build = snapshot.testing.suitePassed > 0 ? "RUNNING" : "PENDING";
  }

  if (snapshot.openGates[0]) {
    const gate = snapshot.openGates[0];
    view.blockedMessage = `BLOCKED: waiting for gate ${gate.gateType}`;
    view.globalStatus = "BLOCKED";
  } else if (snapshot.project.status === "Asking Questions" && snapshot.requirement?.pendingQuestions?.[0]) {
    view.blockedMessage = `BLOCKED: ${resolveAgentDisplayName("question-planner")} waiting for clarification.\nQuestion: ${snapshot.requirement.pendingQuestions[0].question}`;
  } else {
    view.blockedMessage = undefined;
  }

  refreshAgentWaiting(view);
  view.lastUpdateAt = nowTime();
}

export function applyEnvelopeToView(
  view: TuiViewState,
  envelope: EventEnvelope,
  ctx: EventDisplayContext,
): void {
  const payload = envelope.payload;
  const type = payload.type;
  const at = nowTime(envelope.timestamp);

  switch (type) {
    case "project.status_changed": {
      const status = String(payload.status ?? "");
      view.currentPhase = syncPhasesFromStatus(view.phases, status);
      view.globalStatus = deriveGlobalStatus(status, Boolean(view.blockedMessage));
      const phase = view.phases.find((p) => p.id === view.currentPhase);
      pushStream(view, {
        at,
        kind: "PHASE_START",
        text: phase?.label ?? status,
      });
      pushStream(view, { at, kind: "STATUS", text: `status → ${status}` });
      break;
    }
    case "agent.started": {
      const agentId = String(payload.agentId ?? envelope.agentId ?? "agent");
      const key = normalizeAgentId(agentId) ?? agentId;
      if (view.activeAgentId && view.activeAgentId !== key) {
        markAgentDone(view, view.activeAgentId);
      }
      const agent = ensureAgent(view, agentId);
      agent.state = "RUNNING";
      agent.currentTask = "executing";
      ctx.lastAgentId = key;
      ctx.lastAgentName = agent.name;
      view.activeAgentId = key;
      view.activeAgentName = agent.name;
      pushStream(view, {
        at,
        kind: "AGENT_START",
        text: agent.name,
        agent: agent.name,
      });
      break;
    }
    case "agent.plan":
    case "agent.act":
    case "agent.observe":
    case "agent.reflect": {
      const agentId = String(payload.agentId ?? envelope.agentId ?? ctx.lastAgentId ?? "agent");
      const agent = ensureAgent(view, agentId);
      const summary = typeof payload.summary === "string" ? truncate(payload.summary, 120) : "";
      agent.lastReason = summary || agent.lastReason;
      agent.state = type === "agent.reflect" ? "DONE" : agent.state === "TOOL_CALLING" ? "TOOL_CALLING" : "RUNNING";
      if (type === "agent.reflect") agent.stepsDone += 1;
      ctx.lastAgentId = agent.id;
      ctx.lastAgentName = agent.name;
      view.activeAgentId = agent.id;
      view.activeAgentName = agent.name;
      pushStream(view, {
        at,
        kind: "REASON",
        text: summary || `(${type.replace("agent.", "")})`,
        agent: agent.name,
      });
      break;
    }
    case "agent.error": {
      const agentId = String(payload.agentId ?? envelope.agentId ?? ctx.lastAgentId ?? "agent");
      const agent = ensureAgent(view, agentId);
      agent.state = "FAILED";
      agent.errorCount += 1;
      const message = typeof payload.message === "string" ? payload.message : "error";
      pushStream(view, {
        at,
        kind: "ERROR",
        text: message,
        agent: agent.name,
      });
      break;
    }
    case "tool_call.started": {
      const toolCallId = String(payload.toolCallId ?? "");
      const toolName = String(payload.toolName ?? "tool");
      if (toolCallId) ctx.toolNames.set(toolCallId, toolName);
      const agentName = ctx.lastAgentName;
      if (ctx.lastAgentId) {
        const agent = ensureAgent(view, ctx.lastAgentId);
        agent.state = "TOOL_CALLING";
        agent.lastTool = `${toolName} …`;
      }
      const record: ToolCallRecord = {
        id: toolCallId || `${toolName}-${at}`,
        toolName,
        agent: agentName,
        status: "RUNNING",
        startedAt: at,
        retryCount: 0,
      };
      view.toolCalls.push(record);
      if (view.toolCalls.length > MAX_TOOLS) view.toolCalls.shift();
      pushStream(view, {
        at,
        kind: "TOOL_CALL",
        text: toolName,
        agent: agentName,
      });
      break;
    }
    case "tool_call.output": {
      const toolCallId = String(payload.toolCallId ?? "");
      const toolName = ctx.toolNames.get(toolCallId) ?? "tool";
      const output = typeof payload.output === "string" ? payload.output : "";
      const outputSummary = truncate(output, 100);
      const record =
        view.toolCalls.find((t) => t.id === toolCallId) ??
        view.toolCalls[view.toolCalls.length - 1];
      if (record) {
        record.status = "SUCCESS";
        record.outputSummary = outputSummary;
        record.endedAt = at;
      }
      if (ctx.lastAgentId) {
        const agent = ensureAgent(view, ctx.lastAgentId);
        agent.lastTool = `${toolName} ✓`;
        agent.state = "RUNNING";
      }
      addArtifacts(view, inferArtifactsFromOutput(output));
      pushStream(view, {
        at,
        kind: "TOOL_RESULT",
        text: `${toolName} ✓ ${outputSummary}`,
        agent: ctx.lastAgentName,
      });
      break;
    }
    case "tool_call.failed": {
      const toolCallId = String(payload.toolCallId ?? "");
      const toolName = ctx.toolNames.get(toolCallId) ?? "tool";
      const error = typeof payload.error === "string" ? payload.error : "failed";
      const record = view.toolCalls.find((t) => t.id === toolCallId);
      if (record) {
        record.status = "FAILED";
        record.error = error;
        record.endedAt = at;
      }
      if (ctx.lastAgentId) {
        const agent = ensureAgent(view, ctx.lastAgentId);
        agent.lastTool = `${toolName} ✗`;
        agent.errorCount += 1;
      }
      pushStream(view, {
        at,
        kind: "ERROR",
        text: `${toolName}: ${truncate(error, 80)}`,
        agent: ctx.lastAgentName,
      });
      break;
    }
    case "artifact.created": {
      const path = String(payload.path ?? "");
      if (path) addArtifacts(view, [path]);
      pushStream(view, {
        at,
        kind: "AGENT_OUTPUT",
        text: path || String(payload.artifactId ?? "artifact"),
      });
      break;
    }
    case "diff.created": {
      const summary = typeof payload.summary === "string" ? payload.summary : "diff";
      pushStream(view, { at, kind: "AGENT_OUTPUT", text: summary });
      break;
    }
    case "test.result": {
      const suite = String(payload.suite ?? "test");
      const status = String(payload.status ?? "?");
      const key = mapTestSuiteToValidation(suite);
      if (key) {
        view.validation[key] = status === "passed" ? "PASS" : "FAIL";
      }
      pushStream(view, {
        at,
        kind: "VALIDATION",
        text: `${suite} ${status}`,
      });
      break;
    }
    case "human_gate.created":
      view.globalStatus = "BLOCKED";
      view.blockedMessage = `BLOCKED: gate opened — ${String(payload.gateType ?? "?")}`;
      if (ctx.lastAgentId) ensureAgent(view, ctx.lastAgentId).state = "BLOCKED";
      pushStream(view, {
        at,
        kind: "GATE",
        text: `gate opened: ${String(payload.gateType ?? "?")}`,
      });
      break;
    case "human_gate.resolved":
      view.blockedMessage = undefined;
      refreshAgentWaiting(view);
      pushStream(view, {
        at,
        kind: "GATE",
        text: `gate resolved: ${String(payload.decision ?? "?")}`,
      });
      break;
    case "run.failed": {
      view.globalStatus = "FAILED";
      const reason = typeof payload.reason === "string" ? payload.reason : "run failed";
      pushStream(view, { at, kind: "ERROR", text: reason, agent: resolveAgentDisplayName(String(payload.agentId ?? "")) });
      break;
    }
    case "delivery.report_generated": {
      const path = String(payload.artifactPath ?? "");
      if (path) addArtifacts(view, [path]);
      pushStream(view, { at, kind: "AGENT_OUTPUT", text: path || "delivery report" });
      break;
    }
    default:
      pushStream(view, { at, kind: "INFO", text: type });
  }
}

export function bootstrapEventsFromSnapshot(
  view: TuiViewState,
  snapshot: ConsoleSnapshot,
  ctx: EventDisplayContext,
): void {
  if (view.bootstrapped) return;
  const sorted = [...snapshot.events].sort((a, b) => a.seq - b.seq);
  for (const envelope of sorted) {
    applyEnvelopeToView(view, envelope, ctx);
  }
  view.bootstrapped = true;
}

export function formatElapsed(startedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function agentsForDisplay(view: TuiViewState, group?: AgentGroup): AgentPanelState[] {
  const list = Object.values(view.agents);
  if (!group) return list;
  return list.filter((a) => a.group === group);
}

export function deriveCurrentPhaseLabel(view: TuiViewState): string {
  const phase = view.phases.find((p) => p.id === view.currentPhase);
  return phase?.label ?? view.phaseLabel ?? deriveCurrentPhase();
}
