/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalTab } from "./terminal-tab";

const runCommand = vi.fn();
const resolveGate = vi.fn();

vi.mock("@/lib/api", () => ({
  panelApi: {
    runCommand: (...args: unknown[]) => runCommand(...args),
    resolveGate: (...args: unknown[]) => resolveGate(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TerminalTab — M8", () => {
  it("appends ls output to transcript", async () => {
    runCommand.mockResolvedValue({
      exitCode: 0,
      outputRef: { kind: "inline", text: "app.ts\n" },
    });

    render(<TerminalTab projectId="p1" />);
    fireEvent.change(screen.getByLabelText("Terminal command"), { target: { value: "ls" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.getByText("app.ts")).toBeTruthy();
    });
    expect(runCommand).toHaveBeenCalledWith("p1", "ls");
  });

  it("surfaces gate card when high-risk command is rejected", async () => {
    const error = new Error("Command rejected by gate: npm install lodash") as Error & {
      gateId?: string;
      gateType?: string;
    };
    error.gateId = "gate-123";
    error.gateType = "dangerous_operation";
    runCommand.mockRejectedValue(error);

    render(<TerminalTab projectId="p1" />);
    fireEvent.change(screen.getByLabelText("Terminal command"), {
      target: { value: "npm install lodash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.getByText("Command blocked by gate")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "approve" })).toBeTruthy();
  });
});
