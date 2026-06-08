import { describe, expect, it } from "vitest";
import { DevStateSchema } from "@oc/shared";
import { DEVELOPMENT_AGENT_IDS } from "./definitions.js";
import { runScriptedDevAgent } from "./scripted-runner.js";

const baseState = DevStateSchema.parse({
  projectId: "proj-1",
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
});

describe("runScriptedDevAgent", () => {
  it("returns deterministic planner slices for minimal profile", () => {
    const output = runScriptedDevAgent(DEVELOPMENT_AGENT_IDS.planner, {
      state: baseState,
      profile: "minimal",
      prd: "Build app",
      acceptance: "User can create items",
    });
    expect(output).toMatchObject({
      slices: [{ id: "slice-1", title: "Scaffold app" }],
    });
  });

  it("returns two slices for two_slices profile", () => {
    const output = runScriptedDevAgent(DEVELOPMENT_AGENT_IDS.planner, {
      state: baseState,
      profile: "two_slices",
    }) as { slices: unknown[] };
    expect(output.slices).toHaveLength(2);
  });

  it("marks always_fail_slice profile in architect risks", () => {
    const output = runScriptedDevAgent(DEVELOPMENT_AGENT_IDS.architect, {
      state: baseState,
      profile: "always_fail_slice",
    }) as { risks: string[] };
    expect(output.risks.length).toBeGreaterThan(0);
  });
});
