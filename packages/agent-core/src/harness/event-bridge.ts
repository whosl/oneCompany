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
  stop(): void;
};

export function createEventBridge(
  client: OpencodeClient,
  ctx: EventBridgeContext,
): EventBridgeHandle {
  const changedFiles = new Set<string>();
  const seenToolCalls = new Set<string>();
  let aborted = false;

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
        });
      }
    } catch {
      // Bridge stops when the harness tears down the server.
    }
  })();

  return {
    changedFiles,
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
  },
): void {
  switch (event.type) {
    case "permission.updated": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
      void ctx.onPermission(event.properties);
      return;
    }
    case "message.part.updated": {
      if (event.properties.part.sessionID !== ctx.sessionId) {
        return;
      }
      handleToolPart(event.properties.part, ctx, hooks);
      return;
    }
    case "command.executed": {
      if (event.properties.sessionID !== ctx.sessionId) {
        return;
      }
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
      for (const file of event.properties.diff) {
        hooks.changedFiles.add(file.file);
      }
      return;
    }
    case "file.edited": {
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
  hooks: { seenToolCalls: Set<string> },
): void {
  if (part.type !== "tool") {
    return;
  }

  const toolCallId = part.callID;
  const state = part.state;

  if (state.status === "running" && !hooks.seenToolCalls.has(toolCallId)) {
    hooks.seenToolCalls.add(toolCallId);
    ctx.emit({
      type: "tool_call.started",
      toolCallId,
      toolName: part.tool,
    });
    return;
  }

  if (state.status === "completed") {
    ctx.emit({
      type: "tool_call.output",
      toolCallId,
      output: formatCommandOutput(toolCallId, state.output, ctx.logBridge),
    });
    return;
  }

  if (state.status === "error") {
    ctx.emit({
      type: "tool_call.failed",
      toolCallId,
      error: formatCommandOutput(toolCallId, state.error, ctx.logBridge),
    });
  }
}
