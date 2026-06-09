import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  acceptanceCriteriaVersions,
  changeRequests,
  emit,
  getAllowedOptions,
  prdVersions,
  type ChangeRequestKind,
  type Db,
  type EventEnvelope,
} from "@oc/shared";
import { analyzeChangeImpact } from "./change-request-impact.js";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";
import { loadDevSession, saveDevSession, skipSlice } from "./state.js";
import type { DevelopmentSessionPayload, DevelopmentWorkflowDeps } from "./types.js";

function insertChangeRequest(
  db: Db,
  input: {
    projectId: string;
    summary: string;
    kind: ChangeRequestKind;
    impactSummary?: string;
    affectedCommits?: string[];
  },
  onEvent?: (envelope: EventEnvelope) => void,
): string {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(changeRequests)
    .values({
      id,
      project_id: input.projectId,
      summary: input.summary,
      kind: input.kind,
      impact_summary: input.impactSummary ?? null,
      affected_commits: input.affectedCommits
        ? JSON.stringify(input.affectedCommits)
        : null,
      status: "open",
      decision: null,
      created_at: now,
      resolved_at: null,
    })
    .run();

  const envelope = emit(db, {
    projectId: input.projectId,
    payload: {
      type: "change_request.created",
      projectId: input.projectId,
      changeRequestId: id,
      summary: input.summary,
      kind: input.kind,
    },
  });
  onEvent?.(envelope);

  return id;
}

export function createSkipChangeRequest(
  db: Db,
  projectId: string,
  sliceId: string,
  onEvent?: (envelope: EventEnvelope) => void,
): string {
  return insertChangeRequest(
    db,
    {
      projectId,
      summary: `Request skip slice ${sliceId}`,
      kind: "skip_slice",
    },
    onEvent,
  );
}

export function createRequirementChangeRequest(
  db: Db,
  projectId: string,
  summary: string,
  details?: string,
  onEvent?: (envelope: EventEnvelope) => void,
): { changeRequestId: string; impact: ReturnType<typeof analyzeChangeImpact> } {
  const impact = analyzeChangeImpact(db, projectId, summary, details);
  const changeRequestId = insertChangeRequest(
    db,
    {
      projectId,
      summary,
      kind: "requirement_change",
      impactSummary: impact.summary,
      affectedCommits: impact.affectedCommits,
    },
    onEvent,
  );
  return { changeRequestId, impact };
}

export function resolveChangeRequest(
  db: Db,
  changeRequestId: string,
  decision: string,
  onEvent?: (envelope: EventEnvelope) => void,
): void {
  const row = db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.id, changeRequestId))
    .all()[0];
  if (!row) {
    throw new Error(`Change request not found: ${changeRequestId}`);
  }

  const now = new Date().toISOString();
  db.update(changeRequests)
    .set({
      status: "resolved",
      decision,
      resolved_at: now,
    })
    .where(eq(changeRequests.id, changeRequestId))
    .run();

  const envelope = emit(db, {
    projectId: row.project_id,
    payload: {
      type: "change_request.resolved",
      projectId: row.project_id,
      changeRequestId,
      decision,
    },
  });
  onEvent?.(envelope);
}

export function appendAcceptanceVersionForSkip(
  db: Db,
  projectId: string,
  sliceId: string,
): string {
  const current = loadLatestAcceptance(db, projectId);
  const version = bumpAcceptanceVersion(current.version);
  const content = `${current.content}\n\n[waived] Slice ${sliceId} skipped via change review.`;
  const now = new Date().toISOString();

  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version,
      content,
      created_at: now,
    })
    .run();

  return version;
}

function bumpAcceptanceVersion(current: string): string {
  const match = /^ac-(\d+)$/.exec(current);
  if (!match) {
    return `${current}-2`;
  }
  return `ac-${Number(match[1]) + 1}`;
}

export function raiseChangeReviewGate(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
  changeRequestId: string,
  kind: ChangeRequestKind = "skip_slice",
): DevelopmentSessionPayload {
  const gate = deps.createGate(payload.state.projectId, "change_review");
  deps.setStatus(
    payload.state.projectId,
    "Change Review",
    kind === "requirement_change"
      ? "development_requirement_change"
      : "development_request_skip_slice",
  );

  const next: DevelopmentSessionPayload = {
    ...payload,
    meta: {
      ...payload.meta,
      phase: "change_review",
      gateId: gate.id,
      gateType: "change_review",
      pendingChangeRequestId: changeRequestId,
      pendingChangeRequestKind: kind,
    },
  };
  saveDevSession(deps.db, payload.state.projectId, next);
  return next;
}

export function startRequirementChangeReview(
  deps: DevelopmentWorkflowDeps,
  input: { projectId: string; summary: string; details?: string },
): DevelopmentSessionPayload {
  const payload = loadDevSessionForChange(deps, input.projectId);
  const { changeRequestId } = createRequirementChangeRequest(
    deps.db,
    input.projectId,
    input.summary,
    input.details,
    deps.onEvent,
  );
  return raiseChangeReviewGate(deps, payload, changeRequestId, "requirement_change");
}

function loadDevSessionForChange(
  deps: DevelopmentWorkflowDeps,
  projectId: string,
): DevelopmentSessionPayload {
  return loadDevSession(deps.db, projectId);
}

function appendPrdVersionForChange(
  db: Db,
  projectId: string,
  summary: string,
): string {
  const current = loadLatestPrd(db, projectId);
  const version = bumpVersion(current.version, "prd");
  const now = new Date().toISOString();
  db.insert(prdVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version,
      content: `${current.content}\n\n[change review] ${summary}`,
      created_at: now,
    })
    .run();
  return version;
}

function bumpVersion(current: string, prefix: string): string {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(current);
  if (!match) {
    return `${current}-2`;
  }
  return `${prefix}-${Number(match[1]) + 1}`;
}

export function handleChangeReviewDecision(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
  decision: string,
): DevelopmentSessionPayload {
  const changeRequestId = payload.meta.pendingChangeRequestId;
  const kind = payload.meta.pendingChangeRequestKind ?? "skip_slice";
  const sliceId = payload.meta.currentSliceId ?? payload.state.currentTask?.id;
  if (!changeRequestId) {
    throw new Error("Change review session missing change request");
  }
  if (kind === "skip_slice" && !sliceId) {
    throw new Error("Change review session missing slice for skip request");
  }

  resolveChangeRequest(deps.db, changeRequestId, decision, deps.onEvent);

  switch (decision) {
    case "update_plan": {
      if (kind === "requirement_change") {
        const row = deps.db
          .select()
          .from(changeRequests)
          .where(eq(changeRequests.id, changeRequestId))
          .all()[0];
        const summary = row?.summary ?? "Requirement change approved";
        appendPrdVersionForChange(deps.db, payload.state.projectId, summary);
        appendAcceptanceVersionForSkip(deps.db, payload.state.projectId, "requirement-change");
      } else if (sliceId) {
        appendAcceptanceVersionForSkip(deps.db, payload.state.projectId, sliceId);
      }
      const updatedState =
        kind === "skip_slice" && sliceId
          ? skipSlice(payload.state, sliceId)
          : {
              ...payload.state,
              risks: [
                ...payload.state.risks,
                `Requirement change applied via Change Review`,
              ],
            };
      deps.setStatus(payload.state.projectId, "Developing", "change_review_update_plan");
      const next: DevelopmentSessionPayload = {
        ...payload,
        state: updatedState,
        meta: {
          ...payload.meta,
          phase: "slicing",
          gateId: undefined,
          gateType: undefined,
          pendingChangeRequestId: undefined,
          pendingChangeRequestKind: undefined,
        },
      };
      saveDevSession(deps.db, payload.state.projectId, next);
      return next;
    }
    case "revise_tech_plan": {
      deps.setStatus(payload.state.projectId, "Tech Plan Review", "change_review_revise_tech_plan");
      const next: DevelopmentSessionPayload = {
        ...payload,
        meta: {
          ...payload.meta,
          phase: "tech_plan",
          gateId: undefined,
          gateType: undefined,
          pendingChangeRequestId: undefined,
          pendingChangeRequestKind: undefined,
        },
      };
      saveDevSession(deps.db, payload.state.projectId, next);
      return next;
    }
    case "reject": {
      const next: DevelopmentSessionPayload = {
        ...payload,
        meta: {
          ...payload.meta,
          phase: "change_review",
          gateId: undefined,
          gateType: undefined,
        },
      };
      saveDevSession(deps.db, payload.state.projectId, next);
      return next;
    }
    default:
      throw new Error(`Unsupported change review decision: ${decision}`);
  }
}

export function changeReviewGateOptions(): string[] {
  return [...getAllowedOptions("change_review")];
}
