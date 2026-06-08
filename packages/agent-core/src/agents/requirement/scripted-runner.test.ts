import { describe, expect, it } from "vitest";
import { validRequirementState } from "@oc/shared";
import { REQUIREMENT_AGENT_IDS } from "./definitions.js";
import { runScriptedRequirementAgent } from "./scripted-runner.js";

describe("scripted requirement runner — M3", () => {
  const baseTask = {
    state: validRequirementState,
    profile: "vague" as const,
  };

  it("returns schema-valid intake output", () => {
    const output = runScriptedRequirementAgent(REQUIREMENT_AGENT_IDS.intake, baseTask) as {
      normalizedSummary: string;
    };
    expect(output.normalizedSummary).toContain("Normalized:");
  });

  it("returns high score for complete profile", () => {
    const output = runScriptedRequirementAgent(REQUIREMENT_AGENT_IDS.scorer, {
      ...baseTask,
      profile: "complete",
    }) as { completenessScore: number; gaps: unknown[] };
    expect(output.completenessScore).toBeGreaterThanOrEqual(85);
    expect(output.gaps).toHaveLength(0);
  });

  it("returns low-improvement scores for stuck profile", () => {
    const round0 = runScriptedRequirementAgent(REQUIREMENT_AGENT_IDS.scorer, {
      state: { ...validRequirementState, questionRounds: [] },
      profile: "stuck",
    }) as { completenessScore: number };
    const round1 = runScriptedRequirementAgent(REQUIREMENT_AGENT_IDS.scorer, {
      state: {
        ...validRequirementState,
        questionRounds: [
          {
            topic: "users",
            questions: ["q1"],
            answers: ["a1"],
            scoreAfter: 70,
          },
        ],
      },
      profile: "stuck",
    }) as { completenessScore: number };
    expect(round1.completenessScore - round0.completenessScore).toBeLessThan(3);
  });
});
