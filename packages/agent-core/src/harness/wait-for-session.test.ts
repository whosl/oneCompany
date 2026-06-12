import { describe, expect, it, vi } from "vitest";
import type { EventBridgeHandle } from "./event-bridge.js";
import { waitForSessionCompletion } from "./wait-for-session.js";

function mockBridge(idle: boolean): EventBridgeHandle {
  return {
    changedFiles: new Set<string>(),
    isIdle: () => idle,
    hasAssistantReply: () => true,
    stop: () => undefined,
  };
}

describe("waitForSessionCompletion", () => {
  it("returns when idle streak is reached", async () => {
    vi.useFakeTimers();
    let idle = false;
    const bridge: EventBridgeHandle = {
      changedFiles: new Set(),
      isIdle: () => idle,
      hasAssistantReply: () => false,
      stop: () => undefined,
    };

    const done = waitForSessionCompletion(
      { session: { messages: vi.fn() } } as never,
      bridge,
      "ses-1",
      "/tmp/repo",
      60_000,
      { heartbeatIntervalMs: 5_000 },
    );

    await vi.advanceTimersByTimeAsync(16_000);
    idle = true;
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(done).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("throws on timeout when session never becomes idle", async () => {
    vi.useFakeTimers();
    const bridge = mockBridge(false);
    const client = {
      session: {
        messages: vi.fn(async () => ({
          data: [{ info: { role: "assistant" }, parts: [{ type: "tool", state: { status: "running" } }] }],
        })),
      },
    };

    const done = waitForSessionCompletion(
      client as never,
      bridge,
      "ses-1",
      "/tmp/repo",
      5_000,
    );

    const expectation = expect(done).rejects.toThrow(/session not idle/);
    await vi.advanceTimersByTimeAsync(6_000);
    await expectation;
    vi.useRealTimers();
  });

  it("does not complete early just because assistant text exists on server", async () => {
    vi.useFakeTimers();
    const bridge = mockBridge(false);
    const client = {
      session: {
        messages: vi.fn(async () => ({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text: "partial thinking only" }],
            },
          ],
        })),
      },
    };

    const done = waitForSessionCompletion(
      client as never,
      bridge,
      "ses-1",
      "/tmp/repo",
      4_000,
    );

    const expectation = expect(done).rejects.toThrow(/session not idle/);
    await vi.advanceTimersByTimeAsync(5_000);
    await expectation;
    vi.useRealTimers();
  });
});
