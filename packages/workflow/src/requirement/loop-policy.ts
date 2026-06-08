import type { RequirementState } from "@oc/shared";

export function hasCriticalGap(gaps: RequirementState["gaps"]): boolean {
  return gaps.some((gap) => gap.severity === "critical");
}

export function isReadyForPrd(state: RequirementState): boolean {
  return (
    state.completenessScore >= state.completenessThreshold && !hasCriticalGap(state.gaps)
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
