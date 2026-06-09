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
        modelTier: "cheap", // set OC_MODEL_CHEAP to your provider/model, e.g. zai-coding-plan/glm-4.5-air
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
