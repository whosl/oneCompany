import { randomUUID } from "node:crypto";
import {
  PrdAcceptanceOutputSchema,
  acceptanceCriteriaVersions,
  emit,
  prdVersions,
  type Db,
  type EventEnvelope,
  type RequirementState,
} from "@oc/shared";

export type SavePrdResult = {
  state: RequirementState;
  prdVersion: string;
  acceptanceCriteriaVersion: string;
};

export function savePrdAndAcceptance(
  db: Db,
  state: RequirementState,
  output: unknown,
  onEvent?: (envelope: EventEnvelope) => void,
): SavePrdResult {
  const parsed = PrdAcceptanceOutputSchema.parse(output);
  const now = new Date().toISOString();
  const prdVersion = `prd-${state.questionRounds.length + 1}`;
  const acceptanceCriteriaVersion = `ac-${state.questionRounds.length + 1}`;

  db.insert(prdVersions)
    .values({
      id: randomUUID(),
      project_id: state.projectId,
      version: prdVersion,
      content: parsed.prd,
      created_at: now,
    })
    .run();

  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: state.projectId,
      version: acceptanceCriteriaVersion,
      content: parsed.acceptanceCriteria,
      created_at: now,
    })
    .run();

  const envelope = emit(db, {
    projectId: state.projectId,
    payload: {
      type: "artifact.created",
      projectId: state.projectId,
      artifactId: prdVersion,
      path: `artifacts/${state.projectId}/${prdVersion}.md`,
    },
  });
  onEvent?.(envelope);

  return {
    state: {
      ...state,
      prdVersion,
      acceptanceCriteriaVersion,
      assumptions: [...state.assumptions, ...parsed.assumptions],
      risks: [...state.risks, ...parsed.risks],
    },
    prdVersion,
    acceptanceCriteriaVersion,
  };
}
