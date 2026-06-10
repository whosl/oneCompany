/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationsView } from "./page";

const listDefinitions = vi.fn();
const listSkillPacks = vi.fn();
const listProjectStatus = vi.fn();
const enable = vi.fn();
const callTool = vi.fn();

vi.mock("@/lib/api", () => ({
  integrationsApi: {
    listDefinitions: (...args: unknown[]) => listDefinitions(...args),
    listSkillPacks: (...args: unknown[]) => listSkillPacks(...args),
    listProjectStatus: (...args: unknown[]) => listProjectStatus(...args),
    enable: (...args: unknown[]) => enable(...args),
    callTool: (...args: unknown[]) => callTool(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const definitions = [
  {
    id: "github",
    version: "1.0.0",
    protocol: "native",
    mode: "remote",
    displayName: "GitHub",
    description: "Repository handoff",
    toolAllowlist: ["list_repos"],
    permissions: ["read", "write"],
    riskLevel: "medium",
    secretRefs: ["GITHUB_TOKEN"],
    offlineFallbackSkillPackId: "github-offline",
  },
  {
    id: "figma",
    version: "1.0.0",
    protocol: "native",
    mode: "remote",
    displayName: "Figma",
    description: "Design context",
    toolAllowlist: ["get_design_context"],
    permissions: ["read"],
    riskLevel: "low",
    secretRefs: ["FIGMA_ACCESS_TOKEN"],
    offlineFallbackSkillPackId: "figma-offline",
  },
] as const;

describe("IntegrationsView", () => {
  it("shows honest status, mock badges and secret names without values", async () => {
    listDefinitions.mockResolvedValue({ integrations: definitions });
    listSkillPacks.mockResolvedValue({
      skillPacks: [
        {
          id: "github-offline",
          version: "1.0.0",
          replacesIntegrationIds: ["github"],
          title: "GitHub Offline",
          description: "Manual handoff recipes",
          capabilities: [],
          requiredLocalTools: [],
          docsPath: "docs",
        },
      ],
    });
    listProjectStatus.mockResolvedValue({
      integrations: definitions.map((definition) => ({
        integrationId: definition.id,
        displayName: definition.displayName,
        version: definition.version,
        status: definition.id === "github" ? "connected" : "not_configured",
        secretReadiness: definition.secretRefs.map((ref) => ({ ref, configured: false })),
        offlineFallbackSkillPackId: definition.offlineFallbackSkillPackId,
        scopes: definition.id === "github" ? ["read"] : [],
      })),
    });

    render(<IntegrationsView projectId="p1" />);

    await waitFor(() => expect(screen.getByTestId("integration-card-github")).toBeTruthy());
    expect(screen.getAllByText("Simulated adapter")).toHaveLength(2);
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.queryByText(/ghp_/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Figma/ }));
    expect(screen.getByTestId("secret-readiness-FIGMA_ACCESS_TOKEN")).toBeTruthy();
  });

  it("enables a project integration with selected scopes", async () => {
    listDefinitions.mockResolvedValue({ integrations: [definitions[1]] });
    listSkillPacks.mockResolvedValue({ skillPacks: [] });
    listProjectStatus.mockResolvedValue({
      integrations: [
        {
          integrationId: "figma",
          displayName: "Figma",
          version: "1.0.0",
          status: "not_configured",
          secretReadiness: [{ ref: "FIGMA_ACCESS_TOKEN", configured: false }],
          offlineFallbackSkillPackId: "figma-offline",
          scopes: [],
        },
      ],
    });
    enable.mockResolvedValue({ status: "connected" });

    render(<IntegrationsView projectId="p1" />);
    await waitFor(() => expect(screen.getByTestId("integration-card-figma")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Figma/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enable for project" }));

    await waitFor(() => expect(enable).toHaveBeenCalledWith("p1", "figma", ["read"]));
  });
});
