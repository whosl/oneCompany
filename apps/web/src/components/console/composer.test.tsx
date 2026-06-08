/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./composer";
import type { ConsoleProjection } from "@/lib/projection/types";

vi.mock("@/lib/api", () => ({
  consoleApi: {
    resolveGate: vi.fn(),
    startRequirement: vi.fn(),
    submitRequirementAnswers: vi.fn(),
  },
}));

const blockedProjection: ConsoleProjection = {
  snapshot: {
    project: { id: "p1", name: "Demo", slug: "d", status: "Asking Questions", createdAt: "t", updatedAt: "t" },
    phase: { label: "Asking Questions", activeGroup: "Requirement Group" },
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
  streamItems: [],
  swimlane: [],
  lastSeq: 0,
};

afterEach(() => cleanup());

describe("Composer — M9", () => {
  it("shows gate options when blocked and hides free send", () => {
    render(<Composer projectId="p1" projection={blockedProjection} />);
    expect(screen.getByRole("button", { name: "keep answering" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });
});
