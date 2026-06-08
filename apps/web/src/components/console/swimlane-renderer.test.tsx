/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SwimlaneRenderer } from "./swimlane-renderer";
import type { ConsoleProjection } from "@/lib/projection/types";

const projection: ConsoleProjection = {
  snapshot: {
    project: { id: "p1", name: "Demo", slug: "d", status: "Developing", createdAt: "t", updatedAt: "t" },
    phase: { label: "Developing", activeGroup: "Development Group" },
    risks: [],
    openGates: [],
    events: [],
    lastSeq: 0,
  },
  events: [],
  openGates: [],
  agents: {
    "coder@1": { agentId: "coder@1", latestPlan: "Plan", failed: true },
  },
  streamItems: [],
  swimlane: [
    { agentId: "user", phase: "user", summary: "Requirement submitted", status: "completed" },
    { agentId: "coder@1", phase: "plan", summary: "Plan", status: "failed" },
  ],
  lastSeq: 0,
};

afterEach(() => cleanup());

describe("SwimlaneRenderer — M9", () => {
  it("shows user marker and failed agent cell", () => {
    render(<SwimlaneRenderer projection={projection} />);
    expect(screen.getAllByText("user").length).toBeGreaterThan(0);
    expect(screen.getByText("Plan")).toBeTruthy();
  });
});
