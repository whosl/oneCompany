/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { statusScenarios } from "@/lib/projection/scenarios";
import { adaptConsoleProjection } from "./adapter";
import { UiV2Shell } from "./ui-v2-shell";
import { uiV2Fixture } from "./fixture";

afterEach(() => cleanup());

describe("UiV2Shell", () => {
  it("defaults to stream mode with orchestration context", () => {
    render(<UiV2Shell />);

    expect(screen.getByTestId("ui-v2-shell")).toBeTruthy();
    expect(screen.getByTestId("orchestration-strip")).toBeTruthy();
    expect(screen.getAllByText("Orchestrator Agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Development Group").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Coding Agent").length).toBeGreaterThan(0);
    expect(screen.getByTestId("ui-v2-stream")).toBeTruthy();
    expect(screen.queryByTestId("ui-v2-swimlane")).toBeNull();
  });

  it("switches from stream to swimlane without losing the selected run detail", () => {
    render(<UiV2Shell />);

    fireEvent.click(screen.getByRole("button", { name: "swimlane" }));

    expect(screen.getByTestId("ui-v2-swimlane")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-run-detail")).toBeTruthy();
    expect(screen.getByText("coding-slice-2 / Development Group")).toBeTruthy();
    expect(screen.getByText("Events #25 to #32")).toBeTruthy();
    expect(screen.getByText("View full P/A/O/R summaries")).toBeTruthy();
  });

  it("groups swimlane rows and opens workspace tabs from compact cells", () => {
    render(<UiV2Shell />);
    fireEvent.click(screen.getByRole("button", { name: "swimlane" }));

    expect(
      screen.getByTestId("ui-v2-swimlane-group-development").querySelector("button")
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByTestId("ui-v2-swimlane-group-requirement").querySelector("button")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Open files for coding-slice-2" }));
    expect(screen.getByRole("tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps user and gate markers discoverable from swimlane", () => {
    render(<UiV2Shell />);
    fireEvent.click(screen.getByRole("button", { name: "swimlane" }));

    const markers = screen.getByTestId("ui-v2-swimlane-markers");
    expect(markers.textContent).toContain("user");
    expect(markers.textContent).toContain("gate");
    const markerButton = markers.querySelector("button");
    expect(markerButton).toBeTruthy();
    if (markerButton) fireEvent.click(markerButton);
    expect(screen.getByTestId("ui-v2-stream")).toBeTruthy();
  });

  it("keeps the right workspace to exactly five tabs", () => {
    render(<UiV2Shell />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(screen.getByRole("tab", { name: "Files" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Preview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Terminal" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tests" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Report" })).toBeTruthy();
  });

  it("exposes Project Hub and Settings as top-level actions", () => {
    const onOpenProjectHub = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <UiV2Shell
        actions={{
          onOpenProjectHub,
          onOpenSettings,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("ui-v2-project-hub"));
    fireEvent.click(screen.getByTestId("ui-v2-settings"));

    expect(onOpenProjectHub).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("renders live empty states without inventing a gate or agent run", () => {
    render(
      <UiV2Shell
        projection={{
          ...uiV2Fixture,
          source: "live",
          runs: [],
          streamItems: [],
          swimlaneRows: [],
          openGate: undefined,
          files: [],
          tests: [],
          terminalItems: [],
          reportArtifacts: [],
          composer: {
            mode: "requirement",
            reason: "Describe the product requirement.",
            disabled: false,
            readOnly: false,
          },
        }}
      />,
    );

    expect(screen.queryByTestId("ui-v2-gate")).toBeNull();
    expect(screen.queryByTestId("ui-v2-run-detail")).toBeNull();
    expect(screen.getByText("Describe the product requirement.")).toBeTruthy();
  });

  it("separates current work from grouped run history", () => {
    render(<UiV2Shell />);

    expect(screen.getByTestId("ui-v2-current-work")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-run-history")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-run-group-development").hasAttribute("open")).toBe(true);
  });

  it("renders the latest event batch in strict sequence and loads earlier events", () => {
    const streamItems = Array.from({ length: 45 }, (_, index) => ({
      ...uiV2Fixture.streamItems[0]!,
      id: `event-${index + 1}`,
      seq: index + 1,
      title: `Event ${index + 1}`,
    }));

    render(<UiV2Shell projection={{ ...uiV2Fixture, streamItems }} />);

    expect(screen.queryByTestId("ui-v2-event-15")).toBeNull();
    expect(screen.getByTestId("ui-v2-event-16")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-event-45")).toBeTruthy();

    fireEvent.click(screen.getByTestId("ui-v2-load-earlier-events"));

    expect(screen.getByTestId("ui-v2-event-1")).toBeTruthy();
    const renderedSequences = screen
      .getAllByTestId(/ui-v2-event-/)
      .filter((item) => /^ui-v2-event-\d+$/.test(item.getAttribute("data-testid") ?? ""))
      .map((item) => Number(item.getAttribute("data-testid")?.replace("ui-v2-event-", "")));
    expect(renderedSequences).toEqual(Array.from({ length: 45 }, (_, index) => index + 1));
  });

  it("restores stream scroll position after switching modes", () => {
    render(<UiV2Shell />);
    const stream = screen.getByTestId("ui-v2-stream-scroll");
    stream.scrollTop = 240;
    fireEvent.scroll(stream);

    fireEvent.click(screen.getByRole("button", { name: "swimlane" }));
    fireEvent.click(screen.getByRole("button", { name: "stream" }));

    expect(screen.getByTestId("ui-v2-stream-scroll").scrollTop).toBe(240);
  });

  it("disables every mutating action while paused", () => {
    const paused = statusScenarios.find((scenario) => scenario.status === "Paused");
    expect(paused).toBeTruthy();
    if (!paused) return;

    render(
      <UiV2Shell
        projection={adaptConsoleProjection(createProjectionFromSnapshot(paused.snapshot))}
        actions={{
          onPauseResume: vi.fn(),
          onDeploy: vi.fn(),
          onComposerSubmit: vi.fn(),
          onResolveGate: vi.fn(),
        }}
      />,
    );

    expect(screen.getByTestId("ui-v2-paused-banner").textContent).toContain("Developing");
    expect((screen.getByTestId("ui-v2-pause-resume") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("ui-v2-pause-resume").textContent).toContain("Resume");
    expect((screen.getByTestId("ui-v2-deploy") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("ui-v2-deploy").getAttribute("title")).toBe(
      "Resume the project before deploying",
    );
    expect((screen.getByLabelText("Gate decision note") as HTMLInputElement).disabled).toBe(true);
    for (const button of screen.getByTestId("ui-v2-gate").querySelectorAll("button")) {
      expect(button.disabled).toBe(true);
    }
  });

  it("only enables Deploy during Testing and keeps terminal states read-only", () => {
    const testing = statusScenarios.find((scenario) => scenario.status === "Testing");
    const delivered = statusScenarios.find((scenario) => scenario.status === "Delivered");
    expect(testing && delivered).toBeTruthy();
    if (!testing || !delivered) return;

    const { rerender } = render(
      <UiV2Shell
        projection={adaptConsoleProjection(createProjectionFromSnapshot(testing.snapshot))}
        actions={{ onPauseResume: vi.fn(), onDeploy: vi.fn() }}
      />,
    );
    expect((screen.getByTestId("ui-v2-deploy") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("ui-v2-pause-resume") as HTMLButtonElement).disabled).toBe(false);

    rerender(
      <UiV2Shell
        projection={adaptConsoleProjection(createProjectionFromSnapshot(delivered.snapshot))}
        actions={{ onPauseResume: vi.fn(), onDeploy: vi.fn() }}
      />,
    );
    expect((screen.getByTestId("ui-v2-deploy") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("ui-v2-pause-resume") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Project is delivered.").length).toBeGreaterThan(0);
  });
});
