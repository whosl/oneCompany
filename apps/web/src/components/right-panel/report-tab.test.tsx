/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportTab } from "./report-tab";

const getReport = vi.fn();

vi.mock("@/lib/api", () => ({
  panelApi: {
    getReport: (...args: unknown[]) => getReport(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportTab — M8", () => {
  it("renders PRD and explicit empty delivery section", async () => {
    getReport.mockResolvedValue({
      projectStatus: "Testing",
      risks: [],
      sections: [
        { id: "prd", title: "PRD", content: "# Demo PRD" },
        {
          id: "delivery-report",
          title: "Delivery report",
          content: null,
          emptyReason: "Delivery report — not generated yet",
        },
      ],
    });

    render(<ReportTab projectId="p1" />);

    await waitFor(() => {
      expect(screen.getByText("# Demo PRD")).toBeTruthy();
      expect(screen.getByTestId("empty-delivery-report").textContent).toContain("not generated");
    });
  });
});
