import { describe, expect, it } from "vitest";
import {
  createDevSession,
  incrementSliceAttempts,
  loadDevSession,
  markSlicePassed,
  resetSliceAttemptsForNewSlice,
  saveDevSession,
} from "./state.js";
import { setupDevelopmentTest } from "../test-utils.js";

describe("development state persistence", () => {
  it("creates dev session with empty queue and zero attempts", () => {
    const { db, projectId, repoPath, cleanup } = setupDevelopmentTest();
    try {
      const payload = createDevSession(db, projectId, repoPath, "minimal");
      expect(payload.state.taskQueue).toEqual([]);
      expect(payload.state.currentSliceAttempts).toBe(0);
      expect(payload.state.maxSliceAttempts).toBe(4);
    } finally {
      cleanup();
    }
  });

  it("round-trips save and load", () => {
    const { db, projectId, repoPath, cleanup } = setupDevelopmentTest();
    try {
      const payload = createDevSession(db, projectId, repoPath, "minimal");
      const updated = {
        ...payload,
        state: incrementSliceAttempts(payload.state),
      };
      saveDevSession(db, projectId, updated);
      const loaded = loadDevSession(db, projectId);
      expect(loaded.state.currentSliceAttempts).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("resets and marks slice passed", () => {
    const { db, projectId, repoPath, cleanup } = setupDevelopmentTest();
    try {
      let payload = createDevSession(db, projectId, repoPath, "minimal");
      payload = {
        ...payload,
        state: {
          ...payload.state,
          taskQueue: [
            {
              id: "slice-1",
              title: "A",
              testCommand: "pnpm vitest run a.test.ts --reporter=json",
              status: "in_progress",
            },
          ],
          currentSliceAttempts: 2,
        },
      };
      const reset = resetSliceAttemptsForNewSlice(payload.state);
      expect(reset.currentSliceAttempts).toBe(0);
      const passed = markSlicePassed(reset, "slice-1");
      expect(passed.taskQueue[0]?.status).toBe("passed");
      expect(passed.currentTask).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});
