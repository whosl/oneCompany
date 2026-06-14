import { resolveCodingQuestionDecision, type GateMetadata } from "@oc/shared";
import type { AskHumanResult } from "./types.js";

export const CODING_QUESTION_GATE = "coding_question";

export type AskHumanDeps = {
  /** Create a gate row (DB-persisted) carrying metadata for the TUI to render. */
  createGate: (
    projectId: string,
    gateType: string,
    metadata?: GateMetadata,
  ) => { id: string };
  /** Block (polling) until the gate is resolved; returns the stored decision string. */
  waitForGate: (gateId: string) => Promise<string>;
};

/**
 * Build an `askHuman` callback that raises a `coding_question` gate and blocks
 * until the human answers or skips. The question text is carried in
 * `metadata.operation` (the field the TUI already renders for gate context).
 */
export function createAskHuman(
  projectId: string,
  deps: AskHumanDeps,
): (question: string) => Promise<AskHumanResult> {
  return async (question: string): Promise<AskHumanResult> => {
    const gate = deps.createGate(projectId, CODING_QUESTION_GATE, {
      caller: "opencode",
      operation: question,
    });
    const decision = await deps.waitForGate(gate.id);
    return resolveCodingQuestionDecision(decision);
  };
}
