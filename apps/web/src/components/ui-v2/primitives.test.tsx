/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiButton, UiDialog, UiStatusPill, UiTabs } from "./primitives";

afterEach(() => cleanup());

describe("UI v2 primitives", () => {
  it("renders an accessible tab control and reports changes", () => {
    const onTabChange = vi.fn();
    render(
      <UiTabs
        tabs={["Files", "Tests"] as const}
        activeTab="Files"
        onTabChange={onTabChange}
        ariaLabel="Workspace"
      />,
    );

    expect(screen.getByRole("tablist", { name: "Workspace" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Tests" }));
    expect(onTabChange).toHaveBeenCalledWith("Tests");
  });

  it("keeps status text visible and honors disabled buttons", () => {
    const onClick = vi.fn();
    render(
      <>
        <UiStatusPill tone="success" label="passed" />
        <UiButton disabled onClick={onClick}>
          Deploy
        </UiButton>
      </>,
    );

    expect(screen.getByText("passed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("closes dialogs with Escape", () => {
    const onClose = vi.fn();
    render(
      <UiDialog open title="Settings" onClose={onClose}>
        Content
      </UiDialog>,
    );

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
