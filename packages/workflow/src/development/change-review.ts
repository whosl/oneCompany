import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  acceptanceCriteriaVersions,
  changeRequests,
  emit,
  getAllowedOptions,
  type Db,
  type EventEnvelope,
} from "@oc/shared";
import { loadLatestAcceptance } from "./artifacts.js";
import { saveDevSession, skipSlice } from "./state.js";
import type { DevelopmentSessionPayload, DevelopmentWorkflowDeps } from "./types.js";

export function createSkipChangeRequest(
  db: Db,
  projectId: string,
  sliceId: string,
  onEvent?: (envelope: EventEnvelope) => void,
): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  const summary = `Request skip slice ${sliceId}`;

  db.insert(changeRequests)
    .values({
      id,
      project_id: projectId,
      summary,
      status: "open",
      decision: null,
      created_at: now,
      resolved_at: null,
    })
    .run();

  const envelope = emit(db, {
    projectId,
    payload: {
      type: "change_request.created",
      projectId,
      changeRequestId: id,
      summary,
    },
  });
  onEvent?.(envelope);

  return id;
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
): DevelopmentSessionPayload {
  const gate = deps.createGate(payload.state.projectId, "change_review");
  deps.setStatus(payload.state.projectId, "Change Review", "development_request_skip_slice");

  const next: DevelopmentSessionPayload = {
    ...payload,
    meta: {
      ...payload.meta,
      phase: "change_review",
      gateId: gate.id,
      gateType: "change_review",
      pendingChangeRequestId: changeRequestId,
    },
  };
  saveDevSession(deps.db, payload.state.projectId, next);
  return next;
}

export function handleChangeReviewDecision(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
  decision: string,
): DevelopmentSessionPayload {
  const changeRequestId = payload.meta.pendingChangeRequestId;
  const sliceId = payload.meta.currentSliceId ?? payload.state.currentTask?.id;
  if (!changeRequestId || !sliceId) {
    throw new Error("Change review session missing change request or slice");
  }

  resolveChangeRequest(deps.db, changeRequestId, decision, deps.onEvent);

  switch (decision) {
    case "update_plan": {
      appendAcceptanceVersionForSkip(deps.db, payload.state.projectId, sliceId);
      const skipped = skipSlice(payload.state, sliceId);
      deps.setStatus(payload.state.projectId, "Developing", "change_review_update_plan");
      const next: DevelopmentSessionPayload = {
        ...payload,
        state: skipped,
        meta: {
          ...payload.meta,
          phase: "slicing",
          gateId: undefined,
          gateType: undefined,
          pendingChangeRequestId: undefined,
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
