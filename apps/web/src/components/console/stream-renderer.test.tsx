/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { StreamRenderer } from "./stream-renderer";

vi.mock("@/lib/api", () => ({
  consoleApi: { resolveGate: vi.fn() },
}));

const projection = createProjectionFromSnapshot({
  project: {
    id: "p1",
    name: "Demo",
    slug: "d",
    status: "Asking Questions",
    createdAt: "t",
    updatedAt: "t",
  },
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
  events: [
    {
      eventId: "g1",
      seq: 1,
      schemaVersion: "1",
      projectId: "p1",
      timestamp: "t",
      payload: {
        type: "human_gate.created",
        projectId: "p1",
        gateId: "gate-1",
        gateType: "requirement_stuck",
      },
    },
  ],
  lastSeq: 1,
});

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
