import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBridgeHandle } from "./event-bridge.js";
import { waitForSessionCompletion } from "./wait-for-session.js";

function mockBridge(
  idle: boolean,
  options: { seenIdle?: boolean; hasRecentActivity?: () => boolean } = {},
): EventBridgeHandle {
  return {
    changedFiles: new Set<string>(),
    isIdle: () => idle,
    hasSeenSessionIdle: () => options.seenIdle ?? idle,
    hasAssistantReply: () => true,
    hasRecentActivity: options.hasRecentActivity ?? (() => false),
    stop: () => undefined,
  };
}

describe("waitForSessionCompletion", () => {
  beforeEach(() => {
    vi.stubEnv("OC_OPENCODE_STALL_TIMEOUT_MS", "1000");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns when idle streak is reached", async () => {
    vi.useFakeTimers();
    let idle = false;
    const bridge: EventBridgeHandle = {
      changedFiles: new Set(),
      isIdle: () => idle,
      hasSeenSessionIdle: () => idle,
      hasAssistantReply: () => false,
      hasRecentActivity: () => false,
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
  });

  it("does not exit early when tools are completed but session.idle was never seen", async () => {
    vi.useFakeTimers();
    const bridge = mockBridge(false, { seenIdle: false });
    const client = {
      session: {
        messages: vi.fn(async () => ({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "tool", state: { status: "completed" } }],
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
      5_000,
    );

    const expectation = expect(done).rejects.toThrow(/session not idle/);
    await vi.advanceTimersByTimeAsync(6_000);
    await expectation;
  });

  it("uses server poll at timeout when bridge saw idle but lost the flag", async () => {
    vi.useFakeTimers();
    const bridge = mockBridge(false, { seenIdle: true });
    const client = {
      session: {
        messages: vi.fn(async () => ({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "tool", state: { status: "completed" } }],
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
      60_000,
    );

    await vi.advanceTimersByTimeAsync(61_000);
    await expect(done).resolves.toBeUndefined();
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
              parts: [
                { type: "text", text: "partial thinking only" },
                { type: "tool", state: { status: "running" } },
              ],
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
  });

  it("extends the deadline while recent tool activity continues", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const bridge = mockBridge(false, {
      hasRecentActivity: () => Date.now() - startedAt < 5_500,
    });
    const client = {
      session: {
        messages: vi.fn(async () => ({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "tool", state: { status: "running" } }],
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
    let settled = false;
    const observed = done.then(
      () => {
        settled = true;
        return undefined;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );

    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(4_000);
    const error = await observed;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/session not idle/);
  });
});
