import { validRequirementState } from "@oc/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  canAskAnotherRound,
  hasMetQuestionMinimum,
  isBudgetExhausted,
  isReadyForPrd,
  isStuck,
  minTotalQuestions,
  shouldRaiseStuckGate,
  totalQuestionsAsked,
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
        {
          topic: "a",
          questions: [{ question: "q", suggestedAnswers: ["A", "B", "C"] }],
          answers: ["a"],
          scoreAfter: 70,
        },
        {
          topic: "b",
          questions: [{ question: "q", suggestedAnswers: ["A", "B", "C"] }],
          answers: ["a"],
          scoreAfter: 71,
        },
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
        {
          topic: "a",
          questions: [{ question: "q", suggestedAnswers: ["A", "B", "C"] }],
          answers: ["a"],
          scoreAfter: 70,
        },
        {
          topic: "b",
          questions: [{ question: "q", suggestedAnswers: ["A", "B", "C"] }],
          answers: ["a"],
          scoreAfter: 71,
        },
        {
          topic: "c",
          questions: [{ question: "q", suggestedAnswers: ["A", "B", "C"] }],
          answers: ["a"],
          scoreAfter: 72,
        },
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
        {
          topic: "a",
          questions: [{ question: "q", suggestedAnswers: ["A", "B", "C"] }],
          answers: ["a"],
          scoreAfter: 70,
        },
        {
          topic: "b",
          questions: [{ question: "q", suggestedAnswers: ["A", "B", "C"] }],
          answers: ["a"],
          scoreAfter: 78,
        },
      ],
    };
    expect(isStuck(state)).toBe(false);
  });
});

describe("requirement loop policy — minimum question floor", () => {
  afterEach(() => {
    delete process.env.OC_MIN_TOTAL_QUESTIONS;
  });

  const round = (count: number, scoreAfter = 90) => ({
    topic: "t",
    questions: Array.from({ length: count }, (_, i) => ({
      question: `q${i}`,
      suggestedAnswers: ["A"],
    })),
    answers: Array.from({ length: count }, () => "a"),
    scoreAfter,
  });

  it("counts cumulative questions across rounds", () => {
    const state = { ...validRequirementState, questionRounds: [round(3), round(2)] };
    expect(totalQuestionsAsked(state)).toBe(5);
  });

  it("defaults to 0 in test env and honors OC_MIN_TOTAL_QUESTIONS", () => {
    expect(minTotalQuestions()).toBe(0);
    process.env.OC_MIN_TOTAL_QUESTIONS = "6";
    expect(minTotalQuestions()).toBe(6);
  });

  it("blocks PRD readiness until the question floor is met", () => {
    process.env.OC_MIN_TOTAL_QUESTIONS = "6";
    const state = {
      ...validRequirementState,
      completenessScore: 90,
      gaps: [],
      questionRounds: [round(3)],
    };
    expect(hasMetQuestionMinimum(state)).toBe(false);
    expect(isReadyForPrd(state)).toBe(false);
    expect(isReadyForPrd({ ...state, questionRounds: [round(3), round(3)] })).toBe(true);
  });

  it("waives the floor when clarification was skipped", () => {
    process.env.OC_MIN_TOTAL_QUESTIONS = "6";
    const state = {
      ...validRequirementState,
      completenessScore: 90,
      gaps: [],
      clarificationSkipped: true,
      questionRounds: [round(2)],
    };
    expect(hasMetQuestionMinimum(state)).toBe(true);
    expect(isReadyForPrd(state)).toBe(true);
  });

  it("does not raise the stuck gate on a high-score plateau while the floor is unmet", () => {
    process.env.OC_MIN_TOTAL_QUESTIONS = "9";
    const state = {
      ...validRequirementState,
      completenessScore: 90,
      gaps: [],
      questionRounds: [round(3, 89), round(3, 90)],
    };
    expect(isStuck(state)).toBe(false);
    expect(shouldRaiseStuckGate(state)).toBe(false);
    expect(canAskAnotherRound(state)).toBe(true);
  });
});
