/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamRenderer } from "./stream-renderer";
import type { ConsoleProjection } from "@/lib/projection/types";

vi.mock("@/lib/api", () => ({
  consoleApi: { resolveGate: vi.fn() },
}));

const projection: ConsoleProjection = {
  snapshot: {
    project: { id: "p1", name: "Demo", slug: "d", status: "Asking Questions", createdAt: "t", updatedAt: "t" },
    phase: { label: "Asking Questions", activeGroup: "Requirement Group" },
    requirement: {
      rawRequirement: "Build a todo app",
      normalizedSummary: "Todo app",
      completenessScore: 72,
      completenessLocked: false,
      settledChips: [],
      upcomingChips: [],
    },
    risks: [],
    openGates: [
      {
        id: "gate-1",
        gateType: "requirement_stuck",
        status: "open",
        options: ["keep_answering", "force_continue", "fail"],
        decision: null,
        createdAt: "t",
      },
    ],
    events: [],
    lastSeq: 0,
  },
  events: [],
  openGates: [
    {
      id: "gate-1",
      gateType: "requirement_stuck",
      status: "open",
      options: ["keep_answering", "force_continue", "fail"],
      decision: null,
      createdAt: "t",
    },
  ],
  blockingGateId: "gate-1",
  agents: {},
  streamItems: [
    {
      id: "u1",
      origin: "user",
      kind: "user.requirement.raw",
      title: "Your requirement",
      summary: "Build a todo app",
      timestamp: "t",
    },
  ],
  swimlane: [],
  lastSeq: 0,
};

afterEach(() => cleanup());

describe("StreamRenderer — M9", () => {
  it("renders user card and inline blocking gate", () => {
    render(<StreamRenderer projection={projection} />);
    expect(screen.getByText("Build a todo app")).toBeTruthy();
    expect(screen.getByText("Blocking gate")).toBeTruthy();
    expect(screen.getByRole("button", { name: "keep answering" })).toBeTruthy();
  });
});
