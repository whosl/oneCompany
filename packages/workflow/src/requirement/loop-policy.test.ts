import { validRequirementState } from "@oc/shared";
import { describe, expect, it } from "vitest";
import {
  canAskAnotherRound,
  isBudgetExhausted,
  isReadyForPrd,
  isStuck,
  shouldRaiseStuckGate,
} from "./loop-policy.js";

describe("requirement loop policy — M3", () => {
  it("detects PRD readiness without critical gaps", () => {
    expect(
      isReadyForPrd({
        ...validRequirementState,
        completenessScore: 90,
        gaps: [],
      }),
    ).toBe(true);
  });

  it("blocks PRD readiness when a critical gap remains", () => {
    expect(
      isReadyForPrd({
        ...validRequirementState,
        completenessScore: 90,
        gaps: [{ topic: "auth", severity: "critical", question: "Who signs in?" }],
      }),
    ).toBe(false);
  });

  it("detects budget exhaustion", () => {
    const state = {
      ...validRequirementState,
      completenessScore: 70,
      maxQuestionRounds: 2,
      questionRounds: [
        { topic: "a", questions: ["q"], answers: ["a"], scoreAfter: 70 },
        { topic: "b", questions: ["q"], answers: ["a"], scoreAfter: 71 },
      ],
    };
    expect(canAskAnotherRound(state)).toBe(false);
    expect(isBudgetExhausted(state)).toBe(true);
  });

  it("detects stuck loops", () => {
    const state = {
      ...validRequirementState,
      completenessScore: 72,
      completenessThreshold: 85,
      questionRounds: [
        { topic: "a", questions: ["q"], answers: ["a"], scoreAfter: 70 },
        { topic: "b", questions: ["q"], answers: ["a"], scoreAfter: 71 },
        { topic: "c", questions: ["q"], answers: ["a"], scoreAfter: 72 },
      ],
    };
    expect(isStuck(state)).toBe(true);
    expect(shouldRaiseStuckGate(state)).toBe(true);
  });

  it("does not mark improving rounds as stuck", () => {
    const state = {
      ...validRequirementState,
      completenessScore: 80,
      questionRounds: [
        { topic: "a", questions: ["q"], answers: ["a"], scoreAfter: 70 },
        { topic: "b", questions: ["q"], answers: ["a"], scoreAfter: 78 },
      ],
    };
    expect(isStuck(state)).toBe(false);
  });
});
