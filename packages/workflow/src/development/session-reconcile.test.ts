import { describe, expect, it } from "vitest";
import { commits, humanGates } from "@oc/shared";
import { randomUUID } from "node:crypto";
import {
  hasOpenSliceFailureGate,
  reconcilePassedSlicesFromCommits,
  resolveStaleSliceFailureGate,
} from "./session-reconcile.js";
import { createInitialDevState } from "./state.js";
import { setupDevelopmentTest } from "../test-utils.js";

describe("session reconcile", () => {
  it("marks slices passed when commits exist but taskQueue is stale", () => {
    const { db, projectId, cleanup } = setupDevelopmentTest();
    try {
      const state = createInitialDevState(projectId, "/tmp/repo");
      state.taskQueue = [
        {
          id: "slice-1",
          title: "One",
          testCommand: "pnpm vitest run tests/a.test.ts --reporter=json",
          status: "pending",
        },
        {
          id: "slice-2",
          title: "Two",
          testCommand: "pnpm vitest run tests/b.test.ts --reporter=json",
          status: "pending",
        },
      ];

      db.insert(commits)
        .values({
          id: randomUUID(),
          project_id: projectId,
          hash: "abc123",
          task_id: "slice-1",
          summary: "One",
          created_at: new Date().toISOString(),
        })
        .run();

      const reconciled = reconcilePassedSlicesFromCommits(db, state);
      expect(reconciled.taskQueue.find((t) => t.id === "slice-1")?.status).toBe("passed");
      expect(reconciled.taskQueue.find((t) => t.id === "slice-2")?.status).toBe("pending");
      expect(reconciled.commits).toHaveLength(1);
      expect(hasOpenSliceFailureGate(db, projectId)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("detects open slice_failure gate", () => {
    const { db, projectId, cleanup } = setupDevelopmentTest();
    try {
      expect(hasOpenSliceFailureGate(db, projectId)).toBe(false);
      db.insert(humanGates)
        .values({
          id: randomUUID(),
          project_id: projectId,
          gate_type: "slice_failure",
          status: "open",
          options: JSON.stringify(["retry", "replan", "replan_slices", "request_skip_slice", "fail"]),
          decision: null,
          created_at: new Date().toISOString(),
          resolved_at: null,
        })
        .run();
      expect(hasOpenSliceFailureGate(db, projectId)).toBe(true);
      expect(resolveStaleSliceFailureGate(db, projectId)).toBe(true);
      expect(hasOpenSliceFailureGate(db, projectId)).toBe(false);
    } finally {
      cleanup();
    }
  });
});
