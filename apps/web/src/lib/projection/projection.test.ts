import { describe, expect, it } from "vitest";
import type { ConsoleSnapshot } from "@oc/shared";
import { applyEvent, createProjectionFromSnapshot } from "./build-projection";

const baseSnapshot: ConsoleSnapshot = {
  project: {
    id: "p1",
    name: "Demo",
    slug: "demo",
    status: "Developing",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  phase: {
    label: "Developing",
    activeGroup: "Development Group",
    progressLabel: "Slice 2 / 3",
  },
  dev: { sliceIndex: 1, sliceTotal: 3 },
  risks: [],
  openGates: [],
  events: [],
  lastSeq: 0,
};

describe("console projection — M9", () => {
  it("hydrates developing phase from snapshot", () => {
    const projection = createProjectionFromSnapshot(baseSnapshot);
    expect(projection.snapshot.phase.activeGroup).toBe("Development Group");
    expect(projection.snapshot.phase.progressLabel).toBe("Slice 2 / 3");
  });

  it("tracks agent plan and failure from events", () => {
    let projection = createProjectionFromSnapshot(baseSnapshot);
    projection = applyEvent(projection, {
      eventId: "e1",
      seq: 1,
      schemaVersion: "1",
      projectId: "p1",
      agentId: "architect@1",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: { type: "agent.plan", projectId: "p1", agentId: "architect@1", summary: "Plan A" },
    });
    projection = applyEvent(projection, {
      eventId: "e2",
      seq: 2,
      schemaVersion: "1",
      projectId: "p1",
      agentId: "architect@1",
      timestamp: "2026-01-01T00:00:02.000Z",
      payload: {
        type: "agent.error",
        projectId: "p1",
        agentId: "architect@1",
        runId: "run-1",
        message: "boom",
      },
    });

    expect(projection.agents["architect@1"]?.latestPlan).toBe("Plan A");
    expect(projection.agents["architect@1"]?.failed).toBe(true);
    expect(projection.swimlane.some((cell) => cell.status === "failed")).toBe(true);
  });

  it("emphasizes a single blocking gate", () => {
    let projection = createProjectionFromSnapshot(baseSnapshot);
    projection = applyEvent(projection, {
      eventId: "g1",
      seq: 1,
      schemaVersion: "1",
      projectId: "p1",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: {
        type: "human_gate.created",
        projectId: "p1",
        gateId: "gate-1",
        gateType: "requirement_stuck",
      },
    });
    expect(projection.blockingGateId).toBe("gate-1");
    expect(projection.streamItems.some((item) => item.origin === "gate")).toBe(true);
  });

  it("clears the blocking gate once it resolves", () => {
    let projection = createProjectionFromSnapshot(baseSnapshot);
    projection = applyEvent(projection, {
      eventId: "g1",
      seq: 1,
      schemaVersion: "1",
      projectId: "p1",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: {
        type: "human_gate.created",
        projectId: "p1",
        gateId: "gate-1",
        gateType: "requirement_stuck",
      },
    });
    projection = applyEvent(projection, {
      eventId: "g2",
      seq: 2,
      schemaVersion: "1",
      projectId: "p1",
      timestamp: "2026-01-01T00:00:02.000Z",
      payload: {
        type: "human_gate.resolved",
        projectId: "p1",
        gateId: "gate-1",
        decision: "force_continue",
      },
    });

    expect(projection.blockingGateId).toBeUndefined();
    expect(projection.openGates).toHaveLength(0);
  });
});
