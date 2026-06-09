import { describe, expect, it, vi } from "vitest";
import { createEventBridge } from "./event-bridge.js";

function makeClient(events: Array<Record<string, unknown>>) {
  return {
    event: {
      subscribe: vi.fn(async () => ({
        stream: (async function* () {
          for (const event of events) {
            yield event;
          }
        })(),
      })),
    },
  };
}

describe("event-bridge", () => {
  it("maps tool completion to tool_call.output", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const client = makeClient([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-1",
            sessionID: "sess-1",
            messageID: "msg-1",
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "completed",
              input: {},
              output: "done",
              title: "bash",
              metadata: {},
              time: { start: 1, end: 2 },
            },
          },
        },
      },
    ]);

    const bridge = createEventBridge(client as never, {
      sessionId: "sess-1",
      directory: "/tmp/repo",
      emit: (event) => emitted.push(event),
      onPermission: () => undefined,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    bridge.stop();

    expect(emitted).toEqual([
      {
        type: "tool_call.output",
        toolCallId: "call-1",
        output: "done",
      },
    ]);
  });

  it("clears idle latch when new tool activity arrives after session.idle", async () => {
    const client = makeClient([
      {
        type: "session.idle",
        properties: { sessionID: "sess-1" },
      },
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-1",
            sessionID: "sess-1",
            messageID: "msg-1",
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "running",
              input: {},
              output: "",
              title: "bash",
              metadata: {},
              time: { start: 1 },
            },
          },
        },
      },
    ]);

    const bridge = createEventBridge(client as never, {
      sessionId: "sess-1",
      directory: "/tmp/repo",
      emit: () => undefined,
      onPermission: () => undefined,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.isIdle()).toBe(false);
    bridge.stop();
  });

  it("stays busy while permission approval is pending", async () => {
    let releasePermission: (() => void) | undefined;
    const permissionGate = new Promise<void>((resolve) => {
      releasePermission = resolve;
    });

    const client = makeClient([
      {
        type: "session.idle",
        properties: { sessionID: "sess-1" },
      },
      {
        type: "permission.updated",
        properties: { id: "perm-1", sessionID: "sess-1", kind: "bash" },
      },
    ]);

    const bridge = createEventBridge(client as never, {
      sessionId: "sess-1",
      directory: "/tmp/repo",
      emit: () => undefined,
      onPermission: async () => {
        await permissionGate;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.isIdle()).toBe(false);

    releasePermission?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.isIdle()).toBe(false);
    bridge.stop();
  });
});
