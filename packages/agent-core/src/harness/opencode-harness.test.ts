import { describe, expect, it, vi } from "vitest";

vi.mock("../engine-mode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine-mode.js")>();
  return {
    ...actual,
    isOpencodeAvailable: () => false,
  };
});

import { createOpencodeHarness } from "./opencode-harness.js";

describe("OpencodeHarness — M9.5", () => {
  it("throws when opencode CLI is missing", async () => {
    const harness = createOpencodeHarness();
    const authorize = async () => ({ allow: true as const });
    await expect(
      harness.runSlice(
        {
          projectId: "p1",
          sliceId: "slice-1",
          goal: "test",
          acceptanceChecks: [],
          testCommand: "pnpm vitest run --reporter=json",
          modelTier: "cheap",
        },
        { repoPath: "/tmp", emit: () => undefined, authorize },
      ),
    ).rejects.toThrow(/opencode CLI is not installed/);
  });
});
