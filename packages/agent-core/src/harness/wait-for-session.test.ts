import { describe, expect, it, vi } from "vitest";
import type { EventBridgeHandle } from "./event-bridge.js";
import { parseCodingQuestionSignal, waitForSessionCompletion } from "./wait-for-session.js";

function mockBridge(
  idle: boolean,
  options: { seenIdle?: boolean } = {},
): EventBridgeHandle {
  return {
    changedFiles: new Set<string>(),
    isIdle: () => idle,
    hasSeenSessionIdle: () => options.seenIdle ?? idle,
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
      hasSeenSessionIdle: () => idle,
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

    await expect(done).resolves.toEqual({ kind: "completed" });
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
    vi.useRealTimers();
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
    await expect(done).resolves.toEqual({ kind: "completed" });
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
    vi.useRealTimers();
  });

  it("parses a trailing coding_question JSON signal", () => {
    expect(
      parseCodingQuestionSignal('some thinking\n{"coding_question":"用 React 还是 Vue？"}'),
    ).toBe("用 React 还是 Vue？");
    // Trailing whitespace tolerated.
    expect(
      parseCodingQuestionSignal('{"coding_question":"hi"}  \n'),
    ).toBe("hi");
  });

  it("ignores agent prose that is not a structured question", () => {
    expect(parseCodingQuestionSignal("我应该用 React 还是 Vue？")).toBeUndefined();
    expect(parseCodingQuestionSignal("")).toBeUndefined();
    // Question marker must be at the END, not mid-message.
    expect(
      parseCodingQuestionSignal('{"coding_question":"x"}\nfollow up text'),
    ).toBeUndefined();
  });

  it("returns awaiting_answer when an idle session carries a coding_question", async () => {
    vi.useFakeTimers();
    const bridge = mockBridge(true, { seenIdle: true });
    const client = { session: { messages: vi.fn() } };

    const done = waitForSessionCompletion(
      client as never,
      bridge,
      "ses-1",
      "/tmp/repo",
      60_000,
      {
        readLastAssistantText: async () =>
          'hmm\n{"coding_question":"验收入口放哪里？"}',
      },
    );

    // First tick (1.5s) flips idleStreak to 1, then the question check fires.
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(done).resolves.toEqual({
      kind: "awaiting_answer",
      questionText: "验收入口放哪里？",
    });
    vi.useRealTimers();
  });

  it("returns completed when idle has files even if readLastAssistantText is set", async () => {
    vi.useFakeTimers();
    const bridge: EventBridgeHandle = {
      changedFiles: new Set(["src/app.ts"]),
      isIdle: () => true,
      hasSeenSessionIdle: () => true,
      hasAssistantReply: () => true,
      stop: () => undefined,
    };
    const client = { session: { messages: vi.fn() } };
    const readLastAssistantText = vi.fn(async () => '{"coding_question":"x"}');

    const done = waitForSessionCompletion(
      client as never,
      bridge,
      "ses-1",
      "/tmp/repo",
      60_000,
      { readLastAssistantText },
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await expect(done).resolves.toEqual({ kind: "completed" });
    // File-bearing idle should short-circuit before consulting the question reader.
    expect(readLastAssistantText).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
