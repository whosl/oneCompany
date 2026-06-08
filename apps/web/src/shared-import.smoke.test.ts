import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_SLICE_ATTEMPTS, DevStateSchema } from "@oc/shared";

describe("@oc/web shared import smoke — M0 baseline", () => {
  it("imports schemas from @oc/shared workspace package", () => {
    expect(DEFAULT_MAX_SLICE_ATTEMPTS).toBe(4);
    expect(
      DevStateSchema.safeParse({
        projectId: "proj-web",
        repoPath: "/tmp/repo",
        worktreePath: "/tmp/repo",
        sandboxMode: "local",
        techPlanVersion: "tp-1",
        taskQueue: [],
        maxSliceAttempts: 4,
        currentSliceAttempts: 0,
        testResults: [],
        diffs: [],
        commits: [],
        deliveryArtifacts: [],
        risks: [],
      }).success,
    ).toBe(true);
  });
});
