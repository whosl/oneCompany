/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectHub } from "./project-hub";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  consoleApi: {
    listProjects: vi.fn(async () => ({
      projects: [
        {
          id: "p1",
          name: "Alpha",
          slug: "a",
          status: "Developing",
          createdAt: "t",
          updatedAt: "t",
        },
      ],
    })),
    getSnapshot: vi.fn(async () => ({
      project: {
        id: "p1",
        name: "Alpha",
        slug: "a",
        status: "Developing",
        createdAt: "t",
        updatedAt: "t",
      },
      phase: {
        label: "Developing",
        activeGroup: "Development Group",
        progressLabel: "Slice 1 / 2",
      },
      risks: [],
      openGates: [],
      events: [],
      lastSeq: 0,
      dev: { sliceIndex: 0, sliceTotal: 2 },
    })),
    createProject: vi.fn(),
    pauseProject: vi.fn(),
    resumeProject: vi.fn(),
  },
}));

afterEach(() => cleanup());

describe("ProjectHub — M9", () => {
  it("renders lifecycle timeline with nine stages", async () => {
    render(<ProjectHub open currentProjectId="p1" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("lifecycle-timeline")).toBeTruthy();
    });
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.getAllByText("Developing").length).toBeGreaterThan(0);
    expect(screen.getByText("Open gates")).toBeTruthy();
    expect(screen.getByText("Risks")).toBeTruthy();
    expect(screen.queryByText("Environment checks")).toBeNull();
  });
});
