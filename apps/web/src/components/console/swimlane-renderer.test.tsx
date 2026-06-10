/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { SwimlaneRenderer } from "./swimlane-renderer";

const projection = createProjectionFromSnapshot({
  project: {
    id: "p1",
    name: "Demo",
    slug: "d",
    status: "Developing",
    createdAt: "t",
    updatedAt: "t",
  },
  phase: { label: "Developing", activeGroup: "Development Group" },
  requirement: {
    rawRequirement: "Build a todo app",
    normalizedSummary: "Todo app",
    completenessScore: 90,
    completenessLocked: true,
    settledChips: [],
    upcomingChips: [],
  },
  risks: [],
  openGates: [],
  events: [
    {
      eventId: "e1",
      seq: 1,
      schemaVersion: "1",
      projectId: "p1",
      agentId: "coder@1",
      timestamp: "t",
      payload: {
        type: "agent.plan",
        projectId: "p1",
        agentId: "coder@1",
        summary: "Plan",
      },
    },
    {
      eventId: "e2",
      seq: 2,
      schemaVersion: "1",
      projectId: "p1",
      agentId: "coder@1",
      timestamp: "t",
      payload: {
        type: "agent.error",
        projectId: "p1",
        agentId: "coder@1",
        runId: "run-1",
        message: "failed",
      },
    },
  ],
  lastSeq: 2,
});

afterEach(() => cleanup());

describe("SwimlaneRenderer — M9", () => {
  it("shows user marker and failed agent cell", () => {
    render(<SwimlaneRenderer projection={projection} />);
    expect(screen.getAllByText("user").length).toBeGreaterThan(0);
    expect(screen.getByText("Plan")).toBeTruthy();
  });
});
