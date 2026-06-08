/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightPanel } from "./right-panel";

vi.mock("@/lib/api", () => ({
  panelApi: {
    listFiles: vi.fn(async () => ({ scope: "all", files: [] })),
    listDiffs: vi.fn(async () => ({ diffs: [] })),
    getPreviewStatus: vi.fn(async () => ({ health: { reachable: false } })),
    getTestsResults: vi.fn(async () => ({ slice: [], final: [] })),
    getReport: vi.fn(async () => ({
      projectStatus: "Draft Requirement",
      risks: [],
      sections: [],
    })),
  },
}));

afterEach(() => {
  cleanup();
});

describe("RightPanel — M8", () => {
  it("renders exactly five tabs and no sixth tab", () => {
    render(<RightPanel projectId="project-1" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(screen.getByRole("tab", { name: "Files" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Preview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Terminal" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tests" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Report" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
  });
});
