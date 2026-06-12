import { describe, expect, it, vi } from "vitest";
import { createEventBridge } from "./event-bridge.js";

describe("event-bridge — permission idle tracking", () => {
  it("stays busy until onPermission resolves", async () => {
    let resolvePermissionWork!: () => void;
    const permissionWork = new Promise<void>((resolve) => {
      resolvePermissionWork = resolve;
    });

    const client = {
      event: {
        subscribe: vi.fn(async () => ({
          stream: (async function* () {
            yield {
              type: "permission.updated",
              properties: {
                sessionID: "session-1",
                id: "perm-1",
              },
            };
            await permissionWork;
            yield {
              type: "session.idle",
              properties: {
                sessionID: "session-1",
              },
            };
          })(),
        })),
      },
    };

    const bridge = createEventBridge(client as never, {
      sessionId: "session-1",
      directory: "/tmp/repo",
      emit: () => undefined,
      onPermission: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.isIdle()).toBe(false);

    resolvePermissionWork();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (bridge.isIdle()) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(bridge.isIdle()).toBe(true);
    bridge.stop();
  });

  it("emits tool_call.started when a tool enters pending", async () => {
    const emitted: Array<{ type: string; toolName?: string }> = [];
    let resolveStream!: () => void;
    const streamDone = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    const client = {
      event: {
        subscribe: vi.fn(async () => ({
          stream: (async function* () {
            yield {
              type: "message.part.updated",
              properties: {
                part: {
                  id: "part-1",
                  sessionID: "session-1",
                  type: "tool",
                  callID: "call-write-1",
                  tool: "write",
                  state: {
                    status: "pending",
                    input: { filePath: "/tmp/repo/src/App.tsx" },
                  },
                },
              },
            };
            await streamDone;
          })(),
        })),
      },
    };

    const bridge = createEventBridge(client as never, {
      sessionId: "session-1",
      directory: "/tmp/repo",
      emit: (event) => emitted.push(event),
      onPermission: async () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(emitted).toEqual([
      {
        type: "tool_call.started",
        toolCallId: "call-write-1",
        toolName: "write",
        summary: "/tmp/repo/src/App.tsx",
      },
    ]);
    expect(bridge.isIdle()).toBe(false);

    resolveStream();
    bridge.stop();
  });

  it("defers tool_call.started on pending read until input or running", async () => {
    const emitted: Array<{ type: string; summary?: string }> = [];
    let releaseRunning!: () => void;
    const runningGate = new Promise<void>((resolve) => {
      releaseRunning = resolve;
    });

    const client = {
      event: {
        subscribe: vi.fn(async () => ({
          stream: (async function* () {
            yield {
              type: "message.part.updated",
              properties: {
                part: {
                  id: "part-read",
                  sessionID: "session-1",
                  type: "tool",
                  callID: "call-read-1",
                  tool: "read",
                  state: { status: "pending", input: {} },
                },
              },
            };
            await runningGate;
            yield {
              type: "message.part.updated",
              properties: {
                part: {
                  id: "part-read",
                  sessionID: "session-1",
                  type: "tool",
                  callID: "call-read-1",
                  tool: "read",
                  state: {
                    status: "running",
                    input: { filePath: "/tmp/repo/src/App.tsx" },
                  },
                },
              },
            };
          })(),
        })),
      },
    };

    const bridge = createEventBridge(client as never, {
      sessionId: "session-1",
      directory: "/tmp/repo",
      emit: (event) => emitted.push(event),
      onPermission: async () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(emitted).toEqual([]);

    releaseRunning();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(emitted).toEqual([
      {
        type: "tool_call.started",
        toolCallId: "call-read-1",
        toolName: "read",
        summary: "/tmp/repo/src/App.tsx",
      },
    ]);
    expect(bridge.isIdle()).toBe(false);
    bridge.stop();
  });

  it("stays idle when session.diff arrives after session.idle", async () => {
    const client = {
      event: {
        subscribe: vi.fn(async () => ({
          stream: (async function* () {
            yield {
              type: "session.idle",
              properties: { sessionID: "session-1" },
            };
            yield {
              type: "session.diff",
              properties: {
                sessionID: "session-1",
                diff: [{ file: "src/App.tsx" }],
              },
            };
          })(),
        })),
      },
    };

    const bridge = createEventBridge(client as never, {
      sessionId: "session-1",
      directory: "/tmp/repo",
      emit: () => undefined,
      onPermission: async () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.isIdle()).toBe(true);
    expect([...bridge.changedFiles]).toEqual(["src/App.tsx"]);
    bridge.stop();
  });

  it("stays idle when a completed tool part update arrives after session.idle", async () => {
    const client = {
      event: {
        subscribe: vi.fn(async () => ({
          stream: (async function* () {
            yield {
              type: "session.idle",
              properties: { sessionID: "session-1" },
            };
            yield {
              type: "message.part.updated",
              properties: {
                part: {
                  id: "part-1",
                  sessionID: "session-1",
                  type: "tool",
                  callID: "call-1",
                  tool: "bash",
                  state: { status: "completed", output: "ok" },
                },
              },
            };
          })(),
        })),
      },
    };

    const bridge = createEventBridge(client as never, {
      sessionId: "session-1",
      directory: "/tmp/repo",
      emit: () => undefined,
      onPermission: async () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.hasSeenSessionIdle()).toBe(true);
    expect(bridge.isIdle()).toBe(true);
    bridge.stop();
  });
});
