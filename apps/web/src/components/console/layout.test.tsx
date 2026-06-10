/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleLayout } from "./console-layout";

vi.mock("@/lib/projection/use-console-projection", () => ({
  useConsoleProjection: () => ({
    status: "ready",
    refresh: vi.fn(),
    projection: {
      snapshot: {
        project: {
          id: "p1",
          name: "Demo",
          slug: "demo",
          status: "Developing",
          createdAt: "t",
          updatedAt: "t",
        },
        phase: {
          label: "Developing",
          activeGroup: "Development Group",
          progressLabel: "Slice 2 / 3",
        },
        risks: [],
        openGates: [],
        events: [],
        lastSeq: 0,
      },
      events: [],
      openGates: [],
      composer: {
        mode: "read_only",
        disabled: true,
        readOnly: true,
        reason: "Console is read-only in this view.",
      },
      timeline: [],
      agents: {},
      streamItems: [],
      streamGroups: [],
      ungroupedStreamItems: [],
      swimlane: [],
      lastSeq: 0,
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/right-panel/right-panel", () => ({
  RightPanel: () => <div data-testid="right-panel-mock">RightPanel</div>,
}));

afterEach(() => cleanup());

describe("ConsoleLayout — M9", () => {
  it("renders split layout with left panel and right panel", () => {
    render(<ConsoleLayout projectId="p1" />);
    expect(screen.getByTestId("console-layout")).toBeTruthy();
    expect(screen.getByTestId("left-panel")).toBeTruthy();
    expect(screen.getByTestId("right-panel-slot")).toBeTruthy();
    expect(screen.getByTestId("right-panel-mock")).toBeTruthy();
  });
});
