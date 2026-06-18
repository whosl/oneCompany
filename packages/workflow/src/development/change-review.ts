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
  type FunctionSliceTask,
} from "@oc/shared";
import { analyzeChangeImpact } from "./change-request-impact.js";
import { isSliceLoopActive } from "./slice-loop-registry.js";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";
import { loadDevSession, resetSliceForRetry, saveDevSession, skipSlice } from "./state.js";
import type { DevelopmentSessionPayload, DevelopmentWorkflowDeps } from "./types.js";
import { SLICE_FAILURE_GATE } from "./types.js";

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
  const impactSummary = [
    impact.summary,
    impact.rollbackHints.length > 0
      ? `Rollback hints:\n${impact.rollbackHints.map((hint) => `- ${hint}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const changeRequestId = insertChangeRequest(
    db,
    {
      projectId,
      summary,
      kind: "requirement_change",
      impactSummary,
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
  // A live slice loop holds its own in-memory session payload and re-saves it
  // on every iteration — raising a gate here would be silently overwritten
  // (last-write-wins), leaving an open gate nobody can ever resolve.
  if (isSliceLoopActive(input.projectId)) {
    throw new Error(
      "开发循环正在运行，无法开启变更评审 — 请等当前切片完成，或先「暂停」项目",
    );
  }
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

function nextChangeRepairTaskSequence(payload: DevelopmentSessionPayload): number {
  return payload.state.taskQueue.reduce((maximum, task) => {
    const match = /^change-repair-(\d+)$/.exec(task.id);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
}

function buildRequirementChangeRepairTask(
  payload: DevelopmentSessionPayload,
  summary: string,
): FunctionSliceTask {
  const sequence = nextChangeRepairTaskSequence(payload);
  return {
    id: `change-repair-${sequence}`,
    title: "修复用户验收驳回反馈",
    description: [
      "用户在最终验收阶段驳回了交付结果。请优先复现并修复用户报告的问题，不要只修平台 smoke test。",
      "",
      "用户反馈：",
      summary,
      "",
      "修复要求：",
      "- 直接修改生成应用代码，确保用户反馈的浏览器操作路径可用。",
      "- 保持现有 slice 与 final 测试不回归。",
      "- 如问题与 preview base path、API 路由、导航路径有关，必须在真实 preview 路径下验证。",
    ].join("\n"),
    acceptanceChecks: [
      "用户反馈的问题已修复",
      "现有 Vitest 测试通过",
      "全仓类型检查通过",
      "真实 preview 路径下核心交互可用",
    ],
    testCommand: "pnpm vitest run --reporter=json",
    status: "pending",
  };
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
      let requirementChangeTask: FunctionSliceTask | undefined;
      if (kind === "requirement_change") {
        const row = deps.db
          .select()
          .from(changeRequests)
          .where(eq(changeRequests.id, changeRequestId))
          .all()[0];
        const summary = row?.summary ?? "Requirement change approved";
        appendPrdVersionForChange(deps.db, payload.state.projectId, summary);
        appendAcceptanceVersionForSkip(deps.db, payload.state.projectId, "requirement-change");
        requirementChangeTask = buildRequirementChangeRepairTask(payload, summary);
      } else if (sliceId) {
        appendAcceptanceVersionForSkip(deps.db, payload.state.projectId, sliceId);
      }
      const updatedState =
        kind === "skip_slice" && sliceId
          ? skipSlice(payload.state, sliceId)
          : {
              ...payload.state,
              taskQueue: requirementChangeTask
                ? [...payload.state.taskQueue, requirementChangeTask]
                : payload.state.taskQueue,
              currentTask: undefined,
              currentSliceAttempts: 0,
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
          currentSliceId: requirementChangeTask ? requirementChangeTask.id : payload.meta.currentSliceId,
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
      deps.setStatus(payload.state.projectId, "Developing", "change_review_rejected");

      if (kind === "skip_slice" && sliceId) {
        const gate = deps.createGate(payload.state.projectId, SLICE_FAILURE_GATE);
        const next: DevelopmentSessionPayload = {
          ...payload,
          state: {
            ...payload.state,
            risks: [
              ...payload.state.risks,
              "Skip-slice request rejected; slice failure gate reopened",
            ],
          },
          meta: {
            ...payload.meta,
            phase: "awaiting_gate",
            gateId: gate.id,
            gateType: SLICE_FAILURE_GATE,
            currentSliceId: sliceId,
            pendingChangeRequestId: undefined,
            pendingChangeRequestKind: undefined,
          },
        };
        saveDevSession(deps.db, payload.state.projectId, next);
        return next;
      }

      const retrySliceId =
        sliceId ??
        payload.state.taskQueue.find(
          (task) => task.status === "in_progress" || task.status === "failed",
        )?.id;
      const next: DevelopmentSessionPayload = {
        ...payload,
        state: {
          ...(retrySliceId
            ? resetSliceForRetry(payload.state, retrySliceId)
            : payload.state),
          risks: [
            ...payload.state.risks,
            "Change request rejected via Change Review",
          ],
        },
        meta: {
          ...payload.meta,
          phase: "slicing",
          gateId: undefined,
          gateType: undefined,
          currentSliceId: retrySliceId,
          pendingChangeRequestId: undefined,
          pendingChangeRequestKind: undefined,
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
