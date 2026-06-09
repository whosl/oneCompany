/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "./top-nav";
import type { ConsoleProjection } from "@/lib/projection/types";

const developingProjection: ConsoleProjection = {
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
  agents: {},
  streamItems: [],
  swimlane: [],
  lastSeq: 0,
};

afterEach(() => cleanup());

describe("TopNav — M9", () => {
  it("shows development group and slice progress for Developing status", () => {
    render(
      <TopNav
        projection={developingProjection}
        projectId="p1"
        dropdownOpen={false}
        onToggleDropdown={vi.fn()}
        onOpenHub={vi.fn()}
        onOpenSettings={vi.fn()}
        onPauseResume={vi.fn()}
      />,
    );
    expect(screen.getByText("Development Group")).toBeTruthy();
    expect(screen.getByText("Slice 2 / 3")).toBeTruthy();
    expect(screen.queryByText(/Completeness/)).toBeNull();
  });
});
