/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestsTab } from "./tests-tab";

const getTestsResults = vi.fn();

vi.mock("@/lib/api", () => ({
  panelApi: {
    getTestsResults: (...args: unknown[]) => getTestsResults(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TestsTab — M8", () => {
  it("renders per-slice and final acceptance sections", async () => {
    getTestsResults.mockResolvedValue({
      slice: [{ suite: "slice:auth", status: "passed", details: null }],
      final: [
        {
          suite: "final:vitest",
          status: "failed",
          details: "1 failed",
          artifacts: [{ artifactId: "a1", path: "/tmp/trace.zip", kind: "playwright-trace" }],
        },
      ],
    });

    render(<TestsTab projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByText("Per-slice checks")).toBeTruthy();
      expect(screen.getByText("Final acceptance suite")).toBeTruthy();
      expect(screen.getByText("slice:auth")).toBeTruthy();
      expect(screen.getByText("final:vitest")).toBeTruthy();
      expect(screen.getByText("/tmp/trace.zip")).toBeTruthy();
    });
  });
});
