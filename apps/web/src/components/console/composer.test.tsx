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
    startDevelopment: vi.fn(),
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
  streamGroups: [],
  ungroupedStreamItems: [],
  swimlane: [],
  lastSeq: 0,
};

afterEach(() => cleanup());

const questionsProjection: ConsoleProjection = {
  ...blockedProjection,
  openGates: [],
  blockingGateId: undefined,
  snapshot: {
    ...blockedProjection.snapshot,
    openGates: [],
    requirement: {
      rawRequirement: "Build a calendar",
      normalizedSummary: "Calendar app",
      completenessScore: 60,
      completenessLocked: false,
      settledChips: [],
      upcomingChips: [],
      pendingQuestions: [
        {
          question: "Who is the primary user?",
          suggestedAnswers: ["Developers", "Managers", "Everyone"],
        },
        {
          question: "What platforms are required?",
          suggestedAnswers: ["Web only", "Desktop", "Mobile"],
        },
      ],
    },
  },
};

describe("Composer — M9", () => {
  it("shows gate options when blocked and hides free send", () => {
    render(<Composer projectId="p1" projection={blockedProjection} />);
    expect(screen.getByRole("button", { name: "keep answering" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("shows question hint and submit answers action", () => {
    render(
      <Composer
        projectId="p1"
        projection={questionsProjection}
        questionAnswers={["Developers", "Web only"]}
      />,
    );
    expect(screen.getByTestId("composer-questions-hint")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit answers" })).toBeTruthy();
  });

  it("offers start development when PRD is ready", () => {
    render(
      <Composer
        projectId="p1"
        projection={{
          ...blockedProjection,
          snapshot: {
            ...blockedProjection.snapshot,
            project: { ...blockedProjection.snapshot.project, status: "PRD Ready" },
            openGates: [],
          },
          openGates: [],
          blockingGateId: undefined,
        }}
      />,
    );
    expect(screen.getByTestId("composer-start-development")).toBeTruthy();
  });
});
