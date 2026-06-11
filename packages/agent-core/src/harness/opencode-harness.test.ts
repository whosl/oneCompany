import { describe, expect, it, vi } from "vitest";

vi.mock("../engine-mode.js", () => ({
  isOpencodeAvailable: () => false,
}));

vi.mock("./opencode-server.js", () => ({
  startProjectServer: vi.fn(),
  releaseProjectServer: vi.fn(),
}));

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
        {
          repoPath: "/tmp",
          projectId: "p1",
          emit: () => undefined,
          authorize,
        },
      ),
    ).rejects.toThrow(/Coding CLI not found/);
  });
});
