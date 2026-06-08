import { describe, expect, it } from "vitest";
import { ConsoleSnapshotSchema, EnvironmentReadinessSchema } from "./console.js";

describe("console schemas — M9", () => {
  it("parses console snapshot with phase and events", () => {
    const parsed = ConsoleSnapshotSchema.parse({
      project: {
        id: "p1",
        name: "Demo",
        slug: "demo-p1",
        status: "Developing",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      phase: {
        label: "Developing",
        activeGroup: "Development Group",
        progressLabel: "Slice 2 / 3",
      },
      dev: { sliceIndex: 1, sliceTotal: 3 },
      risks: [],
      openGates: [],
      events: [],
      lastSeq: 0,
    });
    expect(parsed.phase.progressLabel).toBe("Slice 2 / 3");
  });

  it("parses environment readiness without secret values", () => {
    const parsed = EnvironmentReadinessSchema.parse({
      workspaceRoot: "/tmp/oc",
      generatedProjectsRoot: "/tmp/oc/generated",
      databasePath: "/tmp/oc/app.sqlite",
      apiKeyReady: false,
      tunnelConfigured: false,
      checks: {
        node: true,
        pnpm: true,
        git: true,
        docker: false,
        playwright: false,
        sqlite: true,
      },
      policies: ["Governed shell risk grading"],
    });
    expect(parsed.apiKeyReady).toBe(false);
    expect(Object.keys(parsed)).not.toContain("openaiApiKey");
  });
});
