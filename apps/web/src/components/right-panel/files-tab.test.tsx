/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilesTab } from "./files-tab";

const listFiles = vi.fn();
const readFile = vi.fn();
const listDiffs = vi.fn();
const getDiffPatch = vi.fn();

vi.mock("@/lib/api", () => ({
  panelApi: {
    listFiles: (...args: unknown[]) => listFiles(...args),
    readFile: (...args: unknown[]) => readFile(...args),
    listDiffs: (...args: unknown[]) => listDiffs(...args),
    getDiffPatch: (...args: unknown[]) => getDiffPatch(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FilesTab — M8", () => {
  it("renders read-only file content without contenteditable", async () => {
    listFiles.mockResolvedValue({ scope: "all", files: ["src/app.ts"] });
    listDiffs.mockResolvedValue({ diffs: [] });
    readFile.mockResolvedValue({ path: "src/app.ts", scope: "repo", content: "export {};" });

    render(<FilesTab projectId="p1" />);
    fireEvent.click(await screen.findByText("src/app.ts"));

    await waitFor(() => {
      expect(screen.getByTestId("file-content").textContent).toContain("export {};");
    });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector("[contenteditable='true']")).toBeNull();
  });
});
