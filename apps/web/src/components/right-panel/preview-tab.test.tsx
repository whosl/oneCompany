/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewTab } from "./preview-tab";

const getPreviewStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  panelApi: {
    getPreviewStatus: (...args: unknown[]) => getPreviewStatus(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PreviewTab — M8", () => {
  it("shows empty state when preview url is missing", async () => {
    getPreviewStatus.mockResolvedValue({ health: { reachable: false } });
    render(<PreviewTab projectId="p1" />);
    await waitFor(() => {
      expect(screen.getByText(/no preview yet/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("preview-iframe")).toBeNull();
  });

  it("embeds iframe when preview url exists", async () => {
    getPreviewStatus.mockResolvedValue({
      previewUrl: "http://127.0.0.1:4173",
      health: { reachable: true, playwrightReady: true },
    });
    render(<PreviewTab projectId="p1" />);
    await waitFor(() => {
      const iframe = screen.getByTestId("preview-iframe") as HTMLIFrameElement;
      expect(iframe.src).toBe("http://127.0.0.1:4173/");
    });
  });
});
