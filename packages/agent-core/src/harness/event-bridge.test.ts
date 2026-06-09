import { describe, expect, it, vi } from "vitest";
import { createEventBridge } from "./event-bridge.js";

describe("event-bridge", () => {
  it("maps tool completion to tool_call.output", async () => {
    const emitted: Array<Record<string, unknown>> = [];
    const events = [
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
    ];

    const client = {
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
});
