/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GateCard } from "./gate-card";

afterEach(() => {
  cleanup();
});

describe("GateCard — M4", () => {
  it("renders exactly the allowed options for requirement_stuck", () => {
    render(
      <GateCard
        gateId="gate-1"
        gateType="requirement_stuck"
        title="Requirement Stuck"
        description="Loop is stuck"
        options={["keep_answering", "force_continue", "fail"]}
        status="open"
        onResolve={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "keep answering" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "force continue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "fail" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "skip risk and continue" })).toBeNull();
  });

  it("submits a custom decision when custom is allowed", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(
      <GateCard
        gateId="gate-2"
        gateType="deployment"
        title="Deployment Confirmation"
        description="Confirm deployment"
        options={["approve", "reject", "custom"]}
        status="open"
        onResolve={onResolve}
      />,
    );

    fireEvent.change(screen.getByLabelText("Custom instruction"), {
      target: { value: "deploy to staging only" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit custom" }));

    expect(onResolve).toHaveBeenCalledWith({
      decision: "custom",
      customText: "deploy to staging only",
    });
  });
});
