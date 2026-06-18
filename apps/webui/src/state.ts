import { AGENTS } from "./catalog";
import type { AgentStatus, AgentView, ConsoleSnapshot, EventEnvelope, TimelineEntry } from "./types";

const normalizeAgentId = (raw: string) => {
  const value = raw.toLowerCase().replace(/_/g, "-");
  if (value.includes("requirement") && value.includes("analyst")) return "requirement-analyst";
  if (value.includes("completeness")) return "completeness-scorer";
  if (value.includes("question")) return "question-planner";
  if (value.includes("prd") || value.includes("acceptance")) return "prd-acceptance";
  if (value.includes("architect")) return "architect";
  if (value.includes("planner") || value.includes("test-designer")) return "planner";
  if (value.includes("coding")) return "coding";
  if (value.includes("review")) return "review";
  if (value === "qa" || value.includes("quality")) return "qa";
  if (value.includes("devops") || value.includes("delivery")) return "devops-delivery";
  if (value.includes("taizi")) return "taizi";
  if (value.includes("intake")) return "intake";
  return value;
};

const eventAgentId = (event: EventEnvelope) => normalizeAgentId(String(event.payload.agentId ?? event.agentId ?? ""));

const statusFromEvent = (type: string): AgentStatus | undefined => {
  if (type === "agent.error" || type === "run.failed") return "failed";
  if (type === "agent.reflect") return "done";
  if (type === "human_gate.created") return "blocked";
  if (type === "tool_call.started") return "tool";
  if (type === "tool_call.output" || type === "tool_call.failed") return "running";
  if (type.startsWith("agent.")) return "running";
  return undefined;
};

export function deriveAgents(snapshot: ConsoleSnapshot): AgentView[] {
  const views = new Map<string, AgentView>(
    AGENTS.map((item) => [
      item.id,
      {
        ...item,
        status: "idle" as AgentStatus,
        toolRuns: 0,
        steps: 0,
        errors: 0,
        artifactCount: 0,
      },
    ]),
  );
  let lastAgentId = "";
  for (const event of [...snapshot.events].sort((a, b) => a.seq - b.seq)) {
    const type = event.payload.type;
    const id = eventAgentId(event) || lastAgentId;
    const agent = views.get(id);
    if (type === "human_gate.resolved") {
      for (const item of views.values()) {
        if (item.status === "blocked") item.status = "waiting";
      }
      continue;
    }
    if (type === "human_gate.created") {
      const blocked = views.get(lastAgentId);
      if (blocked && (blocked.status === "running" || blocked.status === "tool")) blocked.status = "blocked";
      continue;
    }
    if (!agent) continue;
    if (
      lastAgentId &&
      id !== lastAgentId &&
      ["agent.started", "agent.plan", "agent.act", "agent.observe", "agent.reflect"].includes(type)
    ) {
      const previous = views.get(lastAgentId);
      if (previous && (previous.status === "running" || previous.status === "tool")) previous.status = "done";
    }
    const nextStatus = statusFromEvent(type);
    if (nextStatus) agent.status = nextStatus;
    if ((nextStatus === "running" || nextStatus === "tool") && !agent.activeSince) {
      agent.activeSince = new Date(event.timestamp).getTime();
    }
    if (type === "agent.started") agent.activeSince = new Date(event.timestamp).getTime();
    if (type === "agent.plan" || type === "agent.act" || type === "agent.observe" || type === "agent.reflect" || type === "agent.progress") {
      if (!isOpencodeHeartbeat(event.payload.summary)) agent.lastText = String(event.payload.summary ?? "");
    }
    if (type === "agent.reflect") agent.steps += 1;
    if (type === "agent.error" || type === "run.failed") agent.errors += 1;
    if (type === "tool_call.started") {
      agent.toolRuns += 1;
      agent.lastTool = String(event.payload.toolName ?? "tool");
    }
    if (type === "artifact.created") agent.artifactCount += 1;
    if (id) lastAgentId = id;
  }
  for (const agent of views.values()) {
    if (agent.id !== lastAgentId && (agent.status === "running" || agent.status === "tool")) agent.status = "done";
  }
  const activeGroup = snapshot.phase.activeGroup.toLowerCase();
  for (const agent of views.values()) {
    if (agent.status === "idle" && ((activeGroup.includes("requirement") && agent.group === "requirement") || (activeGroup.includes("development") && agent.group === "development"))) {
      agent.status = "waiting";
    }
  }
  return [...views.values()];
}

const at = (timestamp: string) => timestamp.slice(11, 19);
const line = (value: unknown, fallback = "") => String(value ?? fallback).replace(/\s+/g, " ").trim();
const isOpencodeHeartbeat = (value: unknown) => /^Opencode 仍在运行（已 \d+s）…$/.test(line(value));
const processKey = (entry: TimelineEntry) => `${entry.kind}:${entry.tag}:${entry.agent ?? ""}:${line(entry.text).toLowerCase()}`;
const block = (value: unknown, fallback = "") => String(value ?? fallback)
  .replace(/\r\n/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n[ \t]+/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
const taiziText = (value: unknown) => {
  const raw = String(value ?? "");
  const tools = uniqueMatches(raw, /invoke name=["']([^"']+)["']/g);
  const cleaned = block(raw
    .replace(/<｜｜DSML｜｜tool_calls>[\s\S]*?<\/｜｜DSML｜｜tool_calls>/g, "")
    .replace(/<｜｜DSML｜｜[^>]+>/g, "")
    .replace(/<\/｜｜DSML｜｜[^>]+>/g, ""));
  if (cleaned) return cleaned;
  return tools.length > 0 ? `正在调用 ${tools.join("、")} 收集信息…` : "正在处理你的请求…";
};

function uniqueMatches(value: string, pattern: RegExp): string[] {
  return [...new Set([...value.matchAll(pattern)].map((match) => match[1]!).filter(Boolean))];
}

function inferToolSummary(value: unknown): string {
  const raw = String(value ?? "");
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["relativePath", "path", "filePath", "command", "url"]) {
      if (typeof parsed[key] === "string" && parsed[key]) return parsed[key];
    }
  } catch {
    // Some tools return plain text rather than JSON.
  }
  return "";
}

function parseTodoWriteOutput(value: unknown): TimelineEntry["todos"] {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const todos = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return undefined;
        const record = item as Record<string, unknown>;
        const content = line(record.content);
        if (!content) return undefined;
        return {
          content,
          status: line(record.status, "pending"),
          priority: line(record.priority, "medium"),
        };
      })
      .filter((item): item is NonNullable<TimelineEntry["todos"]>[number] => Boolean(item));
    return todos.length ? todos : undefined;
  } catch {
    return undefined;
  }
}

export function eventToTimeline(event: EventEnvelope): TimelineEntry | undefined {
  const p = event.payload;
  if (isOpencodeHeartbeat(p.summary)) return undefined;
  const base = { id: `${event.seq}-${p.type}-${String(p.toolCallId ?? "")}`, seq: event.seq, at: at(event.timestamp), text: "", tag: "", kind: "status" as TimelineEntry["kind"] };
  const agent = AGENTS.find((item) => item.id === eventAgentId(event))?.name;
  switch (p.type) {
    case "project.created": return { ...base, kind: "status", tag: "INIT", text: `project created: ${line(p.name)}` };
    case "project.status_changed": return { ...base, kind: "status", tag: "PHASE", text: `status → ${line(p.status)}` };
    case "agent.started": return { ...base, kind: "agent", tag: "AGENT", agent, text: `${agent ?? "Agent"} started` };
    case "agent.plan": return { ...base, kind: "reason", tag: "PLAN", agent, text: block(p.summary, "正在制定计划") };
    case "agent.act": return { ...base, kind: "process", tag: "ACT", agent, text: line(p.summary, "正在执行") };
    case "agent.observe": return { ...base, kind: "process", tag: "OBS", agent, text: line(p.summary, "正在观察结果") };
    case "agent.reflect": return { ...base, kind: "reason", tag: "REFLT", agent, text: block(p.summary, "阶段完成") };
    case "agent.error":
    case "run.failed": return { ...base, kind: "error", tag: "ERR", agent, text: line(p.message ?? p.reason, "Agent failed") };
    case "tool_call.started": {
      const toolName = line(p.toolName, "tool");
      const isTodo = /todo/i.test(toolName);
      return { ...base, kind: isTodo ? "todo" : "tool", tag: isTodo ? "TODO" : "TOOL", agent, tool: toolName, summary: line(p.summary), text: "" };
    }
    case "tool_call.output": return { ...base, kind: "tool_ok", tag: "OK", agent, tool: line(p.toolName, "tool"), summary: line(p.summary), text: block(p.output) };
    case "tool_call.failed": return { ...base, kind: "tool_err", tag: "FAIL", agent, tool: line(p.toolName, "tool"), text: block(p.error, "Tool failed") };
    case "human_gate.created": return { ...base, kind: "gate", tag: "GATE", text: `${line(p.gateType, "确认项")} — 等待你的决定` };
    case "human_gate.resolved": return { ...base, kind: "gate_ok", tag: "GATE", text: `gate resolved → ${line(p.decision, "done")}` };
    case "artifact.created": return { ...base, kind: "artifact", tag: "FILE", agent, text: line(p.path, "artifact created") };
    case "diff.created": return { ...base, kind: "diff", tag: "DIFF", text: line(p.summary, "diff created") };
    case "test.result": return { ...base, kind: "test", tag: "TEST", text: `${line(p.suite, "test")} → ${line(p.status, "done")}`, summary: line(p.status) };
    case "change_request.created": return { ...base, kind: "change", tag: "CHANGE", text: line(p.summary, "change request created") };
    case "change_request.resolved": return { ...base, kind: "change", tag: "CHANGE", text: `change request resolved → ${line(p.decision, "done")}` };
    case "deployment.started": return { ...base, kind: "deployment", tag: "DEPLOY", text: "deployment started" };
    case "deployment.url_confirmed": return { ...base, kind: "deployment", tag: "DEPLOY", text: `deployment URL confirmed: ${line(p.url)}` };
    case "deployment.completed": return { ...base, kind: "deployment", tag: "DEPLOY", text: p.url ? `deployment completed: ${line(p.url)}` : "deployment completed" };
    case "delivery.report_generated": return { ...base, kind: "delivery", tag: "DELIVERY", text: line(p.artifactPath, "delivery report generated") };
    case "environment.missing_key": return { ...base, kind: "environment", tag: "ENV", text: `${line(p.keyName, "missing key")} — ${line(p.message, "configuration required")}` };
    case "redaction.incident": return { ...base, kind: "redaction", tag: "SEC", text: `${line(p.label, "redaction")} ${p.field ? `· ${line(p.field)}` : ""}` };
    case "user.message":
    case "user.interjection": return { ...base, kind: "user", tag: "USER", text: block(p.text ?? p.message) };
    case "taizi.reply":
    case "taizi.routed": return { ...base, kind: "taizi", tag: "TAIZI", text: taiziText(p.reply ?? p.text), summary: line(p.action) };
    default: return undefined;
  }
}

export function deriveTimeline(snapshot: ConsoleSnapshot): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const toolEntries = new Map<string, TimelineEntry>();
  const recentProcess = new Map<string, number>();
  const pushEntry = (entry: TimelineEntry) => {
    if (entry.kind === "process") {
      const key = processKey(entry);
      const lastSeq = recentProcess.get(key);
      if (lastSeq !== undefined && entry.seq - lastSeq < 25) return;
      recentProcess.set(key, entry.seq);
    }
    entries.push(entry);
  };
  for (const event of snapshot.events) {
    if (event.payload.type === "taizi.routed") {
      const message = block(event.payload.message);
      const lastUser = [...entries].reverse().find((entry) => entry.kind === "user");
      if (message && (!lastUser || lastUser.text !== message || event.seq - lastUser.seq > 2)) {
          pushEntry({
            id: `${event.seq}-taizi-user`,
            seq: event.seq,
            at: at(event.timestamp),
          kind: "user",
          tag: "USER",
          text: message,
        });
      }
      const reply = eventToTimeline(event);
      if (reply) {
        reply.id = `${event.seq}-taizi-reply`;
        pushEntry(reply);
      }
      continue;
    }
    const toolCallId = String(event.payload.toolCallId ?? "");
    if (event.payload.type === "tool_call.started" && toolCallId) {
      const entry = eventToTimeline(event);
      if (entry) {
        entry.id = `tool-${toolCallId}`;
        pushEntry(entry);
        toolEntries.set(toolCallId, entry);
      }
      continue;
    }
    if ((event.payload.type === "tool_call.output" || event.payload.type === "tool_call.failed") && toolCallId) {
      const existing = toolEntries.get(toolCallId);
      if (existing) {
        if (existing.kind !== "todo") {
          existing.kind = event.payload.type === "tool_call.output" ? "tool_ok" : "tool_err";
        }
        existing.text = block(event.payload.output ?? event.payload.error);
        if (existing.kind === "todo") existing.todos = parseTodoWriteOutput(event.payload.output);
        if (!existing.summary) existing.summary = inferToolSummary(event.payload.output ?? event.payload.error);
        continue;
      }
    }
    const entry = eventToTimeline(event);
    if (entry) pushEntry(entry);
  }
  if (snapshot.requirement?.rawRequirement && !entries.some((item) => item.kind === "user")) {
    entries.unshift({ id: "seed-requirement", seq: 0, at: at(snapshot.project.createdAt), kind: "user", tag: "USER", text: snapshot.requirement.rawRequirement });
  }
  return entries;
}

export function appendEvent(snapshot: ConsoleSnapshot, event: EventEnvelope): ConsoleSnapshot {
  if (event.seq === 0 || snapshot.events.some((item) => item.seq === event.seq)) return snapshot;
  const events = [...snapshot.events, event].sort((a, b) => a.seq - b.seq);
  const project = { ...snapshot.project };
  if (event.payload.type === "project.status_changed") project.status = String(event.payload.status ?? project.status);
  return { ...snapshot, project, events, lastSeq: Math.max(snapshot.lastSeq, event.seq) };
}
