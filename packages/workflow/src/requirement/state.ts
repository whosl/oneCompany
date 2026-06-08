import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  DEFAULT_COMPLETENESS_THRESHOLD,
  DEFAULT_MAX_QUESTION_ROUNDS,
  RequirementStateSchema,
  requirementScores,
  requirementSessions,
  type Db,
  type RequirementState,
} from "@oc/shared";
import type { RequirementFixtureProfile } from "@oc/agent-core";
import type { RequirementSessionMeta, RequirementSessionPayload } from "./types.js";

export function createInitialRequirementState(
  projectId: string,
  rawRequirement: string,
): RequirementState {
  return RequirementStateSchema.parse({
    projectId,
    rawRequirement,
    normalizedSummary: "",
    targetUsers: [],
    userGoals: [],
    coreFeatures: [],
    pagesAndFlows: [],
    dataObjects: [],
    rolesAndPermissions: [],
    integrations: [],
    nonFunctionalRequirements: [],
    risks: [],
    assumptions: [],
    gaps: [],
    completenessScore: 0,
    completenessThreshold: DEFAULT_COMPLETENESS_THRESHOLD,
    maxQuestionRounds: DEFAULT_MAX_QUESTION_ROUNDS,
    questionRounds: [],
  });
}

export function createRequirementSession(
  db: Db,
  projectId: string,
  rawRequirement: string,
  profile: RequirementFixtureProfile,
): RequirementSessionPayload {
  const now = new Date().toISOString();
  const payload: RequirementSessionPayload = {
    state: createInitialRequirementState(projectId, rawRequirement),
    meta: {
      phase: "running",
      profile,
    },
  };

  db.insert(requirementSessions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      state: JSON.stringify(payload),
      created_at: now,
      updated_at: now,
    })
    .run();

  return payload;
}

export function loadRequirementSession(db: Db, projectId: string): RequirementSessionPayload {
  const row = db
    .select()
    .from(requirementSessions)
    .where(eq(requirementSessions.project_id, projectId))
    .all()[0];

  if (!row) {
    throw new Error(`Requirement session not found: ${projectId}`);
  }

  return parseSessionPayload(row.state);
}

export function saveRequirementSession(
  db: Db,
  projectId: string,
  payload: RequirementSessionPayload,
): void {
  RequirementStateSchema.parse(payload.state);
  const now = new Date().toISOString();
  db.update(requirementSessions)
    .set({
      state: JSON.stringify(payload),
      updated_at: now,
    })
    .where(eq(requirementSessions.project_id, projectId))
    .run();
}

export function appendRequirementScore(
  db: Db,
  projectId: string,
  roundIndex: number,
  score: number,
): void {
  db.insert(requirementScores)
    .values({
      id: randomUUID(),
      project_id: projectId,
      score,
      round_index: roundIndex,
      created_at: new Date().toISOString(),
    })
    .run();
}

function parseSessionPayload(raw: string): RequirementSessionPayload {
  const parsed = JSON.parse(raw) as RequirementSessionPayload;
  RequirementStateSchema.parse(parsed.state);
  return parsed;
}

export function updateSessionMeta(
  payload: RequirementSessionPayload,
  meta: Partial<RequirementSessionMeta>,
): RequirementSessionPayload {
  return {
    ...payload,
    meta: {
      ...payload.meta,
      ...meta,
    },
  };
}
