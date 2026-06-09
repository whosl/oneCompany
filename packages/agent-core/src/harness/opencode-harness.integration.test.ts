import { describe, expect, it } from "vitest";
import { createOpencodeHarness } from "./opencode-harness.js";

describe.skipIf(!process.env.OC_OPENCODE_INTEGRATION)("OpencodeHarness integration", () => {
  it("starts a governed server and returns a slice result", async () => {
    const harness = createOpencodeHarness();
    const emitted: unknown[] = [];

    const result = await harness.runSlice(
      {
        projectId: "integration",
        sliceId: "slice-integration",
        goal: "noop slice",
        acceptanceChecks: ["server starts"],
        testCommand: "echo ok",
        modelTier: "cheap", // defaults to zhipuai-coding-plan/glm-5.1 from ~/.local/share/opencode/auth.json
      },
      {
        repoPath: process.cwd(),
        projectId: "integration",
        emit: (event) => emitted.push(event),
        authorize: async () => ({ allow: true }),
      },
    );

    expect(result.summary).toBeTruthy();
    expect(emitted.length).toBeGreaterThan(0);
  }, 180_000);
});
