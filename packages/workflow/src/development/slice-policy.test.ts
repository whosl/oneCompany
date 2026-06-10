import { describe, expect, it } from "vitest";
import { DevStateSchema } from "@oc/shared";
import {
  allSlicesPassed,
  getCurrentSlice,
  hasPendingSlices,
  hasRunnableSlices,
  isSliceBudgetExhausted,
  shouldRaiseSliceFailureGate,
} from "./slice-policy.js";

const baseState = DevStateSchema.parse({
  projectId: "p1",
  repoPath: "/tmp",
  worktreePath: "/tmp",
  sandboxMode: "local",
  techPlanVersion: "tp-1",
  taskQueue: [
    {
      id: "s1",
      title: "One",
      testCommand: "pnpm vitest run one.test.ts --reporter=json",
      status: "pending",
    },
    {
      id: "s2",
      title: "Two",
      testCommand: "pnpm vitest run two.test.ts --reporter=json",
      status: "passed",
    },
  ],
  maxSliceAttempts: 4,
  currentSliceAttempts: 0,
  testResults: [],
  diffs: [],
  commits: [],
  deliveryArtifacts: [],
  risks: [],
});

describe("slice policy", () => {
  it("finds current pending slice", () => {
    expect(getCurrentSlice(baseState)?.id).toBe("s1");
    expect(hasPendingSlices(baseState)).toBe(true);
    expect(allSlicesPassed(baseState)).toBe(false);
  });

  it("treats in_progress slices as runnable for the development loop", () => {
    const stuck = DevStateSchema.parse({
      ...baseState,
      taskQueue: [{ ...baseState.taskQueue[0], status: "in_progress" }],
      currentTask: undefined,
    });
    expect(hasPendingSlices(stuck)).toBe(false);
    expect(hasRunnableSlices(stuck)).toBe(true);
  });

  it("detects budget exhaustion and gate trigger", () => {
    expect(isSliceBudgetExhausted(4, 4)).toBe(true);
    expect(shouldRaiseSliceFailureGate(4, 4, false)).toBe(true);
    expect(shouldRaiseSliceFailureGate(3, 4, false)).toBe(false);
    expect(shouldRaiseSliceFailureGate(4, 4, true)).toBe(false);
  });
});
