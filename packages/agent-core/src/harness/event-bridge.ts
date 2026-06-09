import type { Event, OpencodeClient, Part, Permission } from "@opencode-ai/sdk";
import { formatCommandOutput, type LogBridgeDeps } from "./log-bridge.js";

export type HarnessEventPayload = {
  type: string;
  summary?: string;
  toolCallId?: string;
  toolName?: string;
  output?: string;
  error?: string;
  diffId?: string;
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
  let sessionIdle = false;
  let assistantReply = false;
  let pendingPermissions = 0;
  let aborted = false;

  const markSessionActive = () => {
    sessionIdle = false;
  };

  const markSessionIdle = () => {
    sessionIdle = true;
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
    hasAssistantReply() {
      return assistantReply;
    },
    stop() {
      aborted = true;
    },
  };
}

function handleOpencodeEvent(
  event: Event,
  ctx: EventBridgeContext,
  hooks: {
    changedFiles: Set<string>;
    seenToolCalls: Set<string>;
    runningTools: Set<string>;
    markSessionActive: () => void;
    markSessionIdle: () => void;
    markAssistantReply: () => void;
    onPermissionPending: (delta: number) => void;
  },
): void {
  switch (event.type) {
    case "session.idle": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      hooks.markSessionIdle();
      return;
    }
    case "message.updated": {
      return;
    }
    case "permission.updated": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      hooks.markSessionActive();
      hooks.onPermissionPending(1);
      void (async () => {
        try {
          await ctx.onPermission(event.properties);
        } finally {
          hooks.onPermissionPending(-1);
        }
      })();
      return;
    }
    case "message.part.updated": {
      const part = event.properties.part;
      if (part.sessionID !== ctx.sessionId) {
        return;
      }
      hooks.markSessionActive();
      if (
        part.type === "text" &&
        (Boolean(part.text?.trim()) || Boolean(event.properties.delta?.trim()))
      ) {
        hooks.markAssistantReply();
      }
      handleToolPart(part, ctx, hooks);
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
      hooks.markSessionActive();
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

  if (state.status === "running") {
    hooks.markSessionActive();
    if (!hooks.seenToolCalls.has(toolCallId)) {
      hooks.seenToolCalls.add(toolCallId);
      ctx.emit({
        type: "tool_call.started",
        toolCallId,
        toolName: part.tool,
      });
    }
    hooks.runningTools.add(toolCallId);
    return;
  }

  if (state.status === "completed") {
    hooks.runningTools.delete(toolCallId);
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
