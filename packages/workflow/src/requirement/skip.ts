import type { RequirementState } from "@oc/shared";

export const SKIP_RISK_NOTE =
  "Clarification skipped by user; PRD generated from default assumptions.";

/**
 * Default answers for the active question round: first suggested answer when
 * available, otherwise an explicit "system default" marker.
 */
export function buildDefaultAnswers(state: RequirementState): string[] {
  const lastRound = state.questionRounds.at(-1);
  if (!lastRound) {
    return [];
  }
  return lastRound.questions.map(
    (item) => item.suggestedAnswers[0] ?? "采用系统默认假设（用户跳过澄清）",
  );
}

/**
 * Mark the state as clarification-skipped and record every default assumption
 * so the PRD's assumptions section reflects what was decided on the user's behalf.
 */
export function applyClarificationSkip(
  state: RequirementState,
  roundIndex: number,
): RequirementState {
  const round = state.questionRounds[roundIndex];
  const assumptionNotes =
    round?.questions.map(
      (item, i) =>
        `跳过澄清，采用默认假设：${item.question} → ${round.answers[i] ?? "系统默认"}`,
    ) ?? [];

  return {
    ...state,
    clarificationSkipped: true,
    assumptions: [...state.assumptions, ...assumptionNotes],
    risks: state.risks.includes(SKIP_RISK_NOTE) ? state.risks : [...state.risks, SKIP_RISK_NOTE],
  };
}
