/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  streamGroups: [],
  ungroupedStreamItems: [
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

  it("pins to bottom on new stream items when already at bottom", () => {
    const scrollTo = vi.fn();
    const { rerender } = render(<StreamRenderer projection={projection} />);
    const container = screen.getByTestId("stream-scroll-container");
    Object.defineProperty(container, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 400;
    container.scrollTo = scrollTo;
    fireEvent.scroll(container);

    rerender(
      <StreamRenderer
        projection={{
          ...projection,
          lastSeq: 2,
          streamItems: [
            ...projection.streamItems,
            {
              id: "a1",
              origin: "agent",
              kind: "agent.plan",
              title: "Plan",
              summary: "Next step",
              timestamp: "t2",
            },
          ],
        }}
      />,
    );

    expect(scrollTo).toHaveBeenCalled();
  });

  it("shows jump to latest when scrolled away from bottom", () => {
    render(<StreamRenderer projection={projection} />);
    const container = screen.getByTestId("stream-scroll-container");
    Object.defineProperty(container, "scrollHeight", { value: 1200, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 0;
    fireEvent.scroll(container);
    expect(screen.getByTestId("stream-jump-to-latest")).toBeTruthy();
  });
});
