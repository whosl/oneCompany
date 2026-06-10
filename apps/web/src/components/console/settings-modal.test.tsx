/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./settings-modal";

const listDefinitions = vi.fn();
const listProjectStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  integrationsApi: {
    listDefinitions: (...args: unknown[]) => listDefinitions(...args),
    listProjectStatus: (...args: unknown[]) => listProjectStatus(...args),
  },
  consoleApi: {
    getEnvironmentReadiness: vi.fn(async () => ({
      workspaceRoot: "/tmp/oc",
      generatedProjectsRoot: "/tmp/generated",
      databasePath: "/tmp/app.sqlite",
      apiKeyReady: false,
      engine: {
        workflowLlmReady: false,
        opencodeCliReady: true,
        opencodeModelReady: false,
      },
      tunnelConfigured: false,
      checks: { node: true, pnpm: true, git: true, docker: false, playwright: false, sqlite: true },
      policies: ["Governed shell risk grading (read-only)"],
    })),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listDefinitions.mockResolvedValue({
    integrations: [],
    gateway: { adapterMode: "mock", gateMode: "sync", skillPacksRoot: "/skill-packs" },
  });
  listProjectStatus.mockResolvedValue({ integrations: [] });
});

beforeEach(() => {
  listDefinitions.mockResolvedValue({
    integrations: [],
    gateway: { adapterMode: "mock", gateMode: "sync", skillPacksRoot: "/skill-packs" },
  });
  listProjectStatus.mockResolvedValue({ integrations: [] });
});

describe("SettingsModal — M9", () => {
  it("shows environment checks and excludes model routing controls", async () => {
    render(<SettingsModal open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Environment checks")).toBeTruthy();
      expect(screen.getByText(/node: ok/)).toBeTruthy();
    });
    expect(screen.queryByText("Model routing")).toBeNull();
  });

  it("shows §12 degraded notice when engine keys are missing", async () => {
    render(<SettingsModal open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("engine-degraded-notice")).toBeTruthy();
    });
    expect(screen.getByText(/mock data/i)).toBeTruthy();
    expect(screen.getByText("Workflow LLM")).toBeTruthy();
    expect(screen.getByText("Opencode model")).toBeTruthy();
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
    expect(screen.queryByText("New project")).toBeNull();
  });

  it("shows integration gateway summary and project connector counts", async () => {
    listDefinitions.mockResolvedValue({
      integrations: [],
      gateway: { adapterMode: "real", gateMode: "async", skillPacksRoot: "/skill-packs" },
    });
    listProjectStatus.mockResolvedValue({
      integrations: [
        {
          integrationId: "github",
          displayName: "GitHub",
          version: "1.0.0",
          status: "connected",
          secretReadiness: [],
          offlineFallbackSkillPackId: "github-offline",
          scopes: ["read"],
        },
        {
          integrationId: "figma",
          displayName: "Figma",
          version: "1.0.0",
          status: "offline_fallback",
          secretReadiness: [],
          offlineFallbackSkillPackId: "figma-offline",
          scopes: [],
        },
      ],
    });

    render(<SettingsModal open onClose={vi.fn()} projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByTestId("settings-integration-gateway")).toBeTruthy();
    });
    expect(screen.getByText("Real adapters")).toBeTruthy();
    expect(screen.getByText("async")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    const gateway = screen.getByTestId("settings-integration-gateway");
    expect(gateway.textContent).toContain("1");
    expect(gateway.textContent).toContain("Offline");
  });
});
