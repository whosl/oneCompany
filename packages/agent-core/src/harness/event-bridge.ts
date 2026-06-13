import type { Event, OpencodeClient, Part, Permission, ToolPart } from "@opencode-ai/sdk";
import { formatCommandOutput, type LogBridgeDeps } from "./log-bridge.js";

export type HarnessEventPayload = {
  type: string;
  summary?: string;
  toolCallId?: string;
  toolName?: string;
  output?: string;
  error?: string;
  diffId?: string;
  /** agent.stream_delta: id of the message part this snapshot belongs to. */
  streamId?: string;
  /** agent.stream_delta: accumulated text tail of the current generation. */
  text?: string;
  charCount?: number;
};

export type EventBridgeContext = {
  sessionId: string;
  directory: string;
  emit: (event: HarnessEventPayload) => void;
  onPermission: (permission: Permission) => void | Promise<void>;
  logBridge?: LogBridgeDeps;
};

export type EventBridgeHandle = {
  changedFiles: Set<string>;
  isIdle(): boolean;
  /** Latches true once session.idle (or status idle) was observed for this session. */
  hasSeenSessionIdle(): boolean;
  hasAssistantReply(): boolean;
  stop(): void;
};

export function createEventBridge(
  client: OpencodeClient,
  ctx: EventBridgeContext,
): EventBridgeHandle {
  const changedFiles = new Set<string>();
  const seenToolCalls = new Set<string>();
  const runningTools = new Set<string>();
  // Throttled "thinking" forwarding: surfaces the model's narration so the
  // user-facing stream never goes silent for minutes during long generations.
  const thinking = { lastEmitAt: 0, emittedLen: new Map<string, number>() };
  // Bypass token stream (agent.stream_delta): much tighter throttle — these
  // are broadcast-only and never hit the database.
  const streaming = { lastEmitAt: 0 };
  let sessionIdle = false;
  let seenSessionIdle = false;
  let assistantReply = false;
  let pendingPermissions = 0;
  let aborted = false;

  const markSessionActive = () => {
    sessionIdle = false;
  };

  const markSessionIdle = () => {
    sessionIdle = true;
    seenSessionIdle = true;
  };

  const isEffectivelyIdle = () =>
    sessionIdle && runningTools.size === 0 && pendingPermissions === 0;

  void (async () => {
    try {
      const stream = await client.event.subscribe({
        query: { directory: ctx.directory },
      });

      for await (const event of stream.stream) {
        if (aborted) {
          break;
        }
        handleOpencodeEvent(event, ctx, {
          changedFiles,
          seenToolCalls,
          runningTools,
          thinking,
          streaming,
          markSessionActive,
          markSessionIdle,
          markAssistantReply: () => {
            assistantReply = true;
          },
          onPermissionPending: (delta) => {
            pendingPermissions += delta;
          },
        });
      }
    } catch {
      // Bridge stops when the harness tears down the server.
    }
  })();

  return {
    changedFiles,
    isIdle() {
      return isEffectivelyIdle();
    },
    hasSeenSessionIdle() {
      return seenSessionIdle;
    },
    hasAssistantReply() {
      return assistantReply;
    },
    stop() {
      aborted = true;
    },
  };
}

const THINKING_EMIT_INTERVAL_MS = 8_000;
const THINKING_MIN_NEW_CHARS = 60;

const STREAM_DELTA_INTERVAL_MS = 250;
const STREAM_DELTA_MAX_TEXT = 1_500;

/**
 * Live token-stream snapshot for the bypass channel. Sends the accumulated
 * tail (not a diff) so a dropped frame never corrupts the client's view.
 */
function maybeEmitStreamDelta(
  ctx: EventBridgeContext,
  streaming: { lastEmitAt: number },
  partId: string,
  text: string,
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const now = Date.now();
  if (now - streaming.lastEmitAt < STREAM_DELTA_INTERVAL_MS) return;
  streaming.lastEmitAt = now;
  ctx.emit({
    type: "agent.stream_delta",
    streamId: partId,
    text: trimmed.slice(-STREAM_DELTA_MAX_TEXT),
    charCount: trimmed.length,
  });
}

/** Forward a snippet of the model's running narration into the event stream. */
function maybeEmitThinking(
  ctx: EventBridgeContext,
  thinking: { lastEmitAt: number; emittedLen: Map<string, number> },
  partId: string,
  text: string,
): void {
  const now = Date.now();
  const trimmed = text.trim();
  if (!trimmed) return;
  const emitted = thinking.emittedLen.get(partId) ?? 0;
  if (trimmed.length - emitted < THINKING_MIN_NEW_CHARS) return;
  if (now - thinking.lastEmitAt < THINKING_EMIT_INTERVAL_MS) return;

  // Last sentence-ish chunk keeps it readable instead of a mid-word slice.
  const tail = trimmed.slice(-200);
  const sentenceStart = Math.max(
    tail.lastIndexOf("。", tail.length - 2),
    tail.lastIndexOf(". ", tail.length - 2),
    tail.lastIndexOf("\n"),
  );
  const snippet = (sentenceStart > 0 ? tail.slice(sentenceStart + 1) : tail).trim().slice(0, 160);
  if (!snippet) return;

  thinking.lastEmitAt = now;
  thinking.emittedLen.set(partId, trimmed.length);
  ctx.emit({ type: "agent.observe", summary: snippet });
}

function handleOpencodeEvent(
  event: Event,
  ctx: EventBridgeContext,
  hooks: {
    changedFiles: Set<string>;
    seenToolCalls: Set<string>;
    runningTools: Set<string>;
    thinking: { lastEmitAt: number; emittedLen: Map<string, number> };
    streaming: { lastEmitAt: number };
    markSessionActive: () => void;
    markSessionIdle: () => void;
    markAssistantReply: () => void;
    onPermissionPending: (delta: number) => void;
  },
): void {
  // "permission.updated" is the legacy (<=1.0.x) event name; opencode 1.16+
  // emits "permission.asked" (and "permission.v2.asked") instead. Missing the
  // new name leaves the permission unanswered and the session hangs forever.
  const eventType = event.type as string;
  if (
    eventType === "permission.updated" ||
    eventType === "permission.asked" ||
    eventType === "permission.v2.asked"
  ) {
    const properties = (event as { properties: Permission }).properties;
    if (properties.sessionID !== ctx.sessionId) {
      return;
    }
    hooks.markSessionActive();
    hooks.onPermissionPending(1);
    void (async () => {
      try {
        await ctx.onPermission(properties);
      } finally {
        hooks.onPermissionPending(-1);
      }
    })();
    return;
  }

  switch (event.type) {
    case "session.idle": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      hooks.markSessionIdle();
      return;
    }
    case "session.status": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      if (event.properties.status.type === "idle") {
        hooks.markSessionIdle();
      } else {
        hooks.markSessionActive();
      }
      return;
    }
    case "message.updated": {
      return;
    }
    case "message.part.updated": {
      const part = event.properties.part;
      if (part.sessionID !== ctx.sessionId) {
        return;
      }
      if (part.type === "tool") {
        const toolStatus = part.state?.status;
        if (toolStatus === "pending" || toolStatus === "running") {
          hooks.markSessionActive();
        }
        handleToolPart(part, ctx, hooks);
        return;
      }
      hooks.markSessionActive();
      if (
        part.type === "text" &&
        (Boolean(part.text?.trim()) || Boolean(event.properties.delta?.trim()))
      ) {
        hooks.markAssistantReply();
        maybeEmitStreamDelta(ctx, hooks.streaming, part.id, part.text ?? "");
        maybeEmitThinking(ctx, hooks.thinking, part.id, part.text ?? "");
      }
      return;
    }
    case "command.executed": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      hooks.markSessionActive();
      ctx.emit({
        type: "agent.act",
        summary: `command: ${event.properties.name}`,
      });
      return;
    }
    case "session.diff": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      // Diff is emitted after session.idle on mimocode; must not flip back to active.
      for (const file of event.properties.diff) {
        hooks.changedFiles.add(file.file);
      }
      return;
    }
    case "file.edited": {
      hooks.markSessionActive();
      hooks.changedFiles.add(event.properties.file);
      return;
    }
    case "session.error": {
      if (event.properties.sessionID && event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      const message =
        event.properties.error && typeof event.properties.error === "object"
          ? JSON.stringify(event.properties.error)
          : "opencode session error";
      ctx.emit({ type: "agent.observe", summary: message });
      return;
    }
    default:
      return;
  }
}

/** One-line human-readable summary of a tool call (command, file path, …). */
function summarizeToolInput(state: { title?: string; input?: unknown }): string | undefined {
  if (typeof state.title === "string" && state.title.trim()) {
    return state.title.trim().slice(0, 160);
  }
  if (!state.input || typeof state.input !== "object") return undefined;
  const input = state.input as Record<string, unknown>;
  const candidates = [
    input.command,
    input.filePath,
    input.filepath,
    input.path,
    input.file,
    input.target,
    input.relativePath,
    input.pattern,
    input.url,
    input.description,
    input.query,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().replace(/\s+/g, " ").slice(0, 160);
    }
  }
  return undefined;
}

/** Extract a display path from completed tool output (e.g. opencode read `<path>` tags). */
function summarizeToolOutput(toolName: string, output: unknown): string | undefined {
  if (typeof output !== "string") return undefined;
  const trimmed = output.trim();
  if (!trimmed) return undefined;

  const pathTag = trimmed.match(/<path>([^<]+)<\/path>/i);
  if (pathTag?.[1]) {
    return pathTag[1].trim().slice(0, 160);
  }

  const key = toolName.toLowerCase();
  if (key === "read" || key === "glob" || key === "grep" || key === "list" || key === "ls") {
    const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
    if (/^\/|^\.\/|^[a-zA-Z]:[\\/]/.test(firstLine)) {
      return firstLine.slice(0, 160);
    }
  }
  return undefined;
}

function emitToolStarted(
  ctx: EventBridgeContext,
  hooks: { seenToolCalls: Set<string> },
  part: ToolPart,
  summary: string | undefined,
): void {
  const toolCallId = part.callID;
  if (hooks.seenToolCalls.has(toolCallId)) {
    return;
  }
  hooks.seenToolCalls.add(toolCallId);
  ctx.emit({
    type: "tool_call.started",
    toolCallId,
    toolName: part.tool,
    summary,
  });
}

function handleToolPart(
  part: Part,
  ctx: EventBridgeContext,
  hooks: {
    seenToolCalls: Set<string>;
    runningTools: Set<string>;
    markSessionActive: () => void;
  },
): void {
  if (part.type !== "tool") {
    return;
  }

  const toolCallId = part.callID;
  const state = part.state;

  if (state.status === "pending" || state.status === "running") {
    hooks.markSessionActive();
    hooks.runningTools.add(toolCallId);
    const summary = summarizeToolInput(state);
    // Pending often arrives before opencode fills tool input — defer started until
    // we have a summary or the tool transitions to running.
    if (!hooks.seenToolCalls.has(toolCallId) && (summary || state.status === "running")) {
      emitToolStarted(ctx, hooks, part, summary);
    }
    return;
  }

  if (state.status === "completed") {
    hooks.runningTools.delete(toolCallId);
    const summary =
      summarizeToolInput(state) ?? summarizeToolOutput(part.tool, state.output);
    if (!hooks.seenToolCalls.has(toolCallId)) {
      emitToolStarted(ctx, hooks, part, summary);
    }
    ctx.emit({
      type: "tool_call.output",
      toolCallId,
      output: formatCommandOutput(toolCallId, state.output, ctx.logBridge),
    });
    return;
  }

  if (state.status === "error") {
    hooks.runningTools.delete(toolCallId);
    ctx.emit({
      type: "tool_call.failed",
      toolCallId,
      error: formatCommandOutput(toolCallId, state.error, ctx.logBridge),
    });
  }
}
