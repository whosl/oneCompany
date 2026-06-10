import { describe, expect, it } from "vitest";
import type { ConsoleSnapshot, EventEnvelope, ProjectStatus } from "@oc/shared";
import { applyEvent, createProjectionFromSnapshot, deriveComposer } from "./build-projection";

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

function event(
  seq: number,
  payload: EventEnvelope["payload"],
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    eventId: `e${seq}`,
    seq,
    schemaVersion: "1",
    projectId: "p1",
    timestamp: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    payload,
    ...overrides,
  };
}

function snapshotWithStatus(
  status: ProjectStatus,
  overrides: Partial<ConsoleSnapshot> = {},
): ConsoleSnapshot {
  return {
    ...baseSnapshot,
    ...overrides,
    project: {
      ...baseSnapshot.project,
      status,
      ...(overrides.project ?? {}),
    },
  };
}

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

  it("hydrates snapshot events without duplicating them", () => {
    const projection = createProjectionFromSnapshot({
      ...baseSnapshot,
      events: [
        event(1, {
          type: "agent.plan",
          projectId: "p1",
          agentId: "architect@1",
          summary: "Plan from snapshot",
        }),
      ],
      lastSeq: 1,
    });

    expect(projection.events).toHaveLength(1);
    expect(projection.streamItems.filter((item) => item.id === "e1")).toHaveLength(1);
    expect(projection.agents["architect@1"]?.latestPlan).toBe("Plan from snapshot");
  });

  it("keeps timeline events sorted and covers the full shared event taxonomy", () => {
    const projection = createProjectionFromSnapshot({
      ...baseSnapshot,
      events: [
        event(7, {
          type: "delivery.report_generated",
          projectId: "p1",
          artifactPath: "reports/final.md",
        }),
        event(
          2,
          {
            type: "agent.reflect",
            projectId: "p1",
            agentId: "developer@1",
            summary: "Reflection summary",
          },
          { agentId: "developer@1" },
        ),
        event(5, { type: "deployment.started", projectId: "p1" }),
        event(
          3,
          {
            type: "run.failed",
            projectId: "p1",
            agentId: "developer@1",
            runId: "run-1",
            reason: "tests failed",
          },
          { agentId: "developer@1" },
        ),
        event(
          1,
          {
            type: "agent.started",
            projectId: "p1",
            agentId: "developer@1",
            runId: "run-1",
          },
          { agentId: "developer@1" },
        ),
        event(8, { type: "project.status_changed", projectId: "p1", status: "Delivered" }),
        event(4, {
          type: "change_request.created",
          projectId: "p1",
          changeRequestId: "cr-1",
          summary: "Tighten scope",
          kind: "requirement_change",
        }),
        event(6, {
          type: "artifact.created",
          projectId: "p1",
          artifactId: "artifact-1",
          path: "apps/web/src/app/page.tsx",
        }),
      ],
      lastSeq: 8,
    });

    expect(projection.events.map((item) => item.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(projection.streamItems.map((item) => item.kind)).toEqual([
      "agent.started",
      "agent.reflect",
      "run.failed",
      "change_request.created",
      "deployment.started",
      "artifact.created",
      "delivery.report_generated",
      "project.status_changed",
    ]);
    expect(
      projection.streamItems.find((item) => item.kind === "delivery.report_generated")?.metadata
        ?.navigateTab,
    ).toBe("report");
    expect(projection.timeline).toEqual(projection.streamItems);
  });

  it("derives composer modes from workflow state", () => {
    expect(deriveComposer(snapshotWithStatus("Draft Requirement")).mode).toBe("requirement");
    expect(
      deriveComposer(
        snapshotWithStatus("Asking Questions", {
          requirement: {
            rawRequirement: "Build a calendar",
            normalizedSummary: "Calendar",
            completenessScore: 60,
            completenessLocked: false,
            settledChips: [],
            upcomingChips: [],
            pendingQuestions: [{ question: "Who uses it?", suggestedAnswers: ["Team"] }],
          },
        }),
      ).mode,
    ).toBe("question_round");
    expect(deriveComposer(snapshotWithStatus("Developing")).mode).toBe("change_request");
    expect(deriveComposer(snapshotWithStatus("Testing")).mode).toBe("change_request");
    expect(deriveComposer(snapshotWithStatus("PRD Ready")).mode).toBe("read_only");
    expect(deriveComposer(snapshotWithStatus("Delivered")).readOnly).toBe(true);
    expect(deriveComposer(snapshotWithStatus("Failed")).readOnly).toBe(true);
    expect(deriveComposer(snapshotWithStatus("Paused", { pausedFrom: "Developing" })).mode).toBe(
      "paused",
    );

    const gated = snapshotWithStatus("Deploying", {
      openGates: [
        {
          id: "gate-deploy",
          gateType: "deployment",
          status: "open",
          options: ["provide_url", "fail"],
          decision: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(deriveComposer(gated, "gate-deploy").mode).toBe("deployment_url");
  });
});
