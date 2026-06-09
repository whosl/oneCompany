import { describe, expect, it, vi } from "vitest";
import { StubHarness } from "./stub.js";

describe("StubHarness — M2", () => {
  it("emits plan/act/observe and calls authorize once", async () => {
    const emitted: unknown[] = [];
    const authorize = vi.fn(async () => ({ allow: true as const }));

    const result = await StubHarness.runSlice(
      {
        projectId: "p1",
        sliceId: "slice-01",
        goal: "demo",
        acceptanceChecks: ["tests pass"],
        testCommand: "pnpm vitest run slice-01",
        modelTier: "cheap",
      },
      {
        repoPath: "/tmp/repo",
        projectId: "p1",
        emit: (event) => emitted.push(event),
        authorize,
      },
    );

    expect(result.passed).toBe(true);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(emitted.map((e) => (e as { type: string }).type)).toEqual([
      "agent.plan",
      "agent.act",
      "agent.observe",
    ]);
  });

  it("returns passed=false when authorize denies", async () => {
    const result = await StubHarness.runSlice(
      {
        projectId: "p1",
        sliceId: "slice-02",
        goal: "demo",
        acceptanceChecks: [],
        testCommand: "rm -rf /",
        modelTier: "strong",
      },
      {
        repoPath: "/tmp/repo",
        projectId: "p1",
        emit: () => {},
        authorize: async () => ({ allow: false, reason: "blocked" }),
      },
    );

    expect(result.passed).toBe(false);
  });
});
