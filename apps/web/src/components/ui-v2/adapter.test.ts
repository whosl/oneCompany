import { describe, expect, it } from "vitest";
import type { ConsoleSnapshot, EventEnvelope } from "@oc/shared";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { adaptConsoleProjection } from "./adapter";

function event(
  seq: number,
  payload: EventEnvelope["payload"],
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    eventId: `event-${seq}`,
    seq,
    schemaVersion: "1",
    projectId: "project-1",
    timestamp: `2026-06-10T09:${String(seq).padStart(2, "0")}:00.000Z`,
    payload,
    ...overrides,
  };
}

const baseSnapshot: ConsoleSnapshot = {
  project: {
    id: "project-1",
    name: "Live Project",
    slug: "generated/live-project",
    status: "Developing",
    createdAt: "2026-06-10T09:00:00.000Z",
    updatedAt: "2026-06-10T09:08:00.000Z",
  },
  phase: {
    label: "Developing",
    activeGroup: "Development Group",
    progressLabel: "Slice 1 / 2",
  },
  requirement: {
    rawRequirement: "Build a live project",
    normalizedSummary: "Live project with tests",
    completenessScore: 91,
    completenessLocked: true,
    settledChips: ["Scope confirmed"],
    upcomingChips: ["Acceptance"],
  },
  dev: { currentSliceId: "slice-1", sliceIndex: 0, sliceTotal: 2 },
  risks: [],
  openGates: [
    {
      id: "gate-1",
      gateType: "dangerous_operation",
      status: "open",
      options: ["approve", "reject"],
      decision: null,
      createdAt: "2026-06-10T09:07:00.000Z",
    },
  ],
  events: [
    event(
      1,
      {
        type: "agent.started",
        projectId: "project-1",
        agentId: "coding@1",
        runId: "run-1",
      },
      { agentId: "coding@1", runId: "run-1" },
    ),
    event(
      2,
      {
        type: "agent.plan",
        projectId: "project-1",
        agentId: "coding@1",
        summary: "Implement slice one",
      },
      { agentId: "coding@1", runId: "run-1" },
    ),
    event(
      3,
      {
        type: "agent.act",
        projectId: "project-1",
        agentId: "coding@1",
        summary: "Write project files",
      },
      { agentId: "coding@1", runId: "run-1" },
    ),
    event(
      4,
      {
        type: "tool_call.started",
        projectId: "project-1",
        toolCallId: "tool-1",
        toolName: "shell.run",
      },
      { agentId: "coding@1", runId: "run-1" },
    ),
    event(
      5,
      {
        type: "diff.created",
        projectId: "project-1",
        diffId: "diff-1",
        summary: "apps/web/src/app/page.tsx",
      },
      { agentId: "coding@1", runId: "run-1" },
    ),
    event(
      6,
      {
        type: "test.result",
        projectId: "project-1",
        suite: "unit",
        status: "passed",
      },
      { agentId: "coding@1", runId: "run-1" },
    ),
    event(7, {
      type: "artifact.created",
      projectId: "project-1",
      artifactId: "artifact-1",
      path: "artifacts/plan.md",
    }),
  ],
  lastSeq: 7,
};

describe("adaptConsoleProjection", () => {
  it("maps live runs, gates, timeline, and workspace events", () => {
    const viewModel = adaptConsoleProjection(createProjectionFromSnapshot(baseSnapshot));

    expect(viewModel.source).toBe("live");
    expect(viewModel.project.name).toBe("Live Project");
    expect(viewModel.composer.mode).toBe("gate_decision");
    expect(viewModel.openGate?.options.map((option) => option.id)).toEqual(["approve", "reject"]);
    expect(viewModel.runs).toHaveLength(1);
    expect(viewModel.runs[0]?.id).toBe("run-1");
    expect(viewModel.runs[0]?.status).toBe("gated");
    expect(viewModel.currentWork.primaryRunId).toBe("run-1");
    expect(viewModel.currentWork.gateId).toBe("gate-1");
    expect(viewModel.runGroups[0]?.runIds).toContain("run-1");
    expect(viewModel.streamItems.find((item) => item.id === "event-2")?.runId).toBe("run-1");
    expect(viewModel.streamItems.map((item) => item.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(viewModel.streamItems.some((item) => item.id === "user-requirement-raw")).toBe(false);
    expect(viewModel.files).toEqual([
      { path: "apps/web/src/app/page.tsx", status: "changed" },
      { path: "artifacts/plan.md", status: "artifact" },
    ]);
    expect(viewModel.tests[0]?.name).toBe("unit");
    expect(viewModel.terminalItems[0]?.title).toBe("shell.run");
  });

  it("assigns requirement agents to the Requirement Group", () => {
    const snapshot: ConsoleSnapshot = {
      ...baseSnapshot,
      openGates: [],
      events: [
        event(
          1,
          {
            type: "agent.started",
            projectId: "project-1",
            agentId: "completeness-scorer@1",
            runId: "requirement-run",
          },
          { agentId: "completeness-scorer@1", runId: "requirement-run" },
        ),
        event(
          2,
          {
            type: "agent.plan",
            projectId: "project-1",
            agentId: "completeness-scorer@1",
            summary: "Score requirement completeness",
          },
          { agentId: "completeness-scorer@1", runId: "requirement-run" },
        ),
      ],
      lastSeq: 2,
    };

    const viewModel = adaptConsoleProjection(createProjectionFromSnapshot(snapshot));
    expect(viewModel.runs[0]?.groupId).toBe("requirement");
    expect(viewModel.swimlaneRows[0]?.groupId).toBe("requirement");
  });

  it("supports an initial project with no runs or gates", () => {
    const snapshot: ConsoleSnapshot = {
      ...baseSnapshot,
      project: { ...baseSnapshot.project, status: "Draft Requirement" },
      phase: { label: "Draft Requirement", activeGroup: "Requirement Group" },
      requirement: undefined,
      dev: undefined,
      openGates: [],
      events: [],
      lastSeq: 0,
    };

    const viewModel = adaptConsoleProjection(createProjectionFromSnapshot(snapshot));

    expect(viewModel.runs).toEqual([]);
    expect(viewModel.currentWork.primaryRunId).toBeUndefined();
    expect(viewModel.runGroups).toEqual([]);
    expect(viewModel.openGate).toBeUndefined();
    expect(viewModel.composer.mode).toBe("requirement");
    expect(viewModel.requirementSnapshot.score).toBe(0);
    expect(viewModel.swimlaneRows).toEqual([]);
  });
});
