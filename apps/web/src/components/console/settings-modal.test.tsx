/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./settings-modal";

vi.mock("@/lib/api", () => ({
  consoleApi: {
    getEnvironmentReadiness: vi.fn(async () => ({
      workspaceRoot: "/tmp/oc",
      generatedProjectsRoot: "/tmp/generated",
      databasePath: "/tmp/app.sqlite",
      apiKeyReady: false,
      tunnelConfigured: false,
      checks: { node: true, pnpm: true, git: true, docker: false, playwright: false, sqlite: true },
      policies: ["Governed shell risk grading (read-only)"],
    })),
  },
}));

afterEach(() => cleanup());

describe("SettingsModal — M9", () => {
  it("shows environment checks and excludes model routing controls", async () => {
    render(<SettingsModal open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Environment checks")).toBeTruthy();
      expect(screen.getByText(/node: ok/)).toBeTruthy();
    });
    expect(screen.queryByText("Model routing")).toBeNull();
  });
});
