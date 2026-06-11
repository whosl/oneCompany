import { DEFAULT_MIN_TOTAL_QUESTIONS, type RequirementState } from "@oc/shared";

export function hasCriticalGap(gaps: RequirementState["gaps"]): boolean {
  return gaps.some((gap) => gap.severity === "critical");
}

export function totalQuestionsAsked(state: RequirementState): number {
  return state.questionRounds.reduce((sum, round) => sum + round.questions.length, 0);
}

/**
 * Cumulative clarification-question floor before PRD generation.
 * Stub engine and test runs keep the legacy behavior (0) so fixture flows stay
 * deterministic; override either way with OC_MIN_TOTAL_QUESTIONS.
 */
export function minTotalQuestions(): number {
  const raw = process.env.OC_MIN_TOTAL_QUESTIONS;
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  if (process.env.OC_USE_STUB_ENGINE === "1" || process.env.NODE_ENV === "test") {
    return 0;
  }
  return DEFAULT_MIN_TOTAL_QUESTIONS;
}

export function hasMetQuestionMinimum(state: RequirementState): boolean {
  if (state.clarificationSkipped) {
    return true;
  }
  return totalQuestionsAsked(state) >= minTotalQuestions();
}

export function isReadyForPrd(state: RequirementState): boolean {
  return (
    state.completenessScore >= state.completenessThreshold &&
    !hasCriticalGap(state.gaps) &&
    hasMetQuestionMinimum(state)
  );
}

export function canAskAnotherRound(state: RequirementState): boolean {
  return state.questionRounds.length < state.maxQuestionRounds;
}

export function isBudgetExhausted(state: RequirementState): boolean {
  return state.questionRounds.length >= state.maxQuestionRounds && !isReadyForPrd(state);
}

export function isStuck(state: RequirementState): boolean {
  if (isReadyForPrd(state)) {
    return false;
  }
  // Score already passes; only the question floor is pending. A score plateau
  // here is expected, not a stuck loop — keep asking rounds instead.
  if (
    state.completenessScore >= state.completenessThreshold &&
    !hasCriticalGap(state.gaps) &&
    !hasMetQuestionMinimum(state)
  ) {
    return false;
  }

  const scoredRounds = state.questionRounds.filter(
    (round) => round.answers.length > 0 && round.scoreAfter > 0,
  );
  if (scoredRounds.length < 2) {
    return false;
  }

  const lastTwo = scoredRounds.slice(-2);
  const improvement = lastTwo[1]!.scoreAfter - lastTwo[0]!.scoreAfter;
  return improvement < 3;
}

export function shouldRaiseStuckGate(state: RequirementState): boolean {
  return !isReadyForPrd(state) && (isBudgetExhausted(state) || isStuck(state));
}
