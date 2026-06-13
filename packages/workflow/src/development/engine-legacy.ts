import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { commitSlice, ensureDevRepoScaffold, initRepo } from "@oc/workspace";
import {
  appendCustomGateNote,
  emit,
  getAllowedOptions,
  humanGates,
  resolveGateDecision,
  sliceSuiteId,
} from "@oc/shared";
import { persistRunnerResult } from "../testing/results.js";
import { DEVELOPMENT_AGENT_IDS, OPENCODE_NO_FILE_CHANGES_SUMMARY } from "@oc/agent-core";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";
import {
  createSkipChangeRequest,
  handleChangeReviewDecision,
  raiseChangeReviewGate,
} from "./change-review.js";
import {
  isSliceLoopActive,
  markSliceLoopActive,
  markSliceLoopInactive,
} from "./slice-loop-registry.js";
import { captureDiff } from "./diffs.js";
import { runPlanner } from "./planner.js";
import {
  hasOpenSliceFailureGate,
  reconcilePassedSlicesFromCommits,
  resolveStaleSliceFailureGate,
} from "./session-reconcile.js";
import {
  allSlicesPassed,
  effectiveMaxSliceAttempts,
  getCurrentSlice,
  hasRunnableSlices,
  shouldRaiseSliceFailureGate,
} from "./slice-policy.js";
import {
  createDevSession,
  incrementSliceAttempts,
  loadDevSession,
  markSliceFailed,
  markSliceInProgress,
  markSlicePassed,
  resetSliceForRetry,
  resetSliceAttemptsForNewSlice,
  saveDevSession,
  updateDevSessionMeta,
} from "./state.js";
import { raiseTechPlanGate, runArchitect } from "./tech-plan.js";
import type {
  DevelopmentRunResult,
  DevelopmentSessionPayload,
  DevelopmentWorkflowDeps,
  SliceIterationResult,
} from "./types.js";
import {
  CHANGE_REVIEW_GATE,
  SLICE_FAILURE_GATE,
  SLICE_RETRY_BUDGET_EXTENSION,
  TECH_PLAN_CONFIRM_GATE,
  buildSliceSpec,
} from "./types.js";
import { buildHarnessContext } from "./harness-context.js";
import type { DevFixtureProfile } from "@oc/agent-core";

function toResult(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): DevelopmentRunResult {
  const gateType = payload.meta.gateType;
  return {
    phase: payload.meta.phase,
    projectStatus: deps.getProjectStatus(payload.state.projectId),
    gateId: payload.meta.gateId,
    gateType,
    gateOptions: gateType ? [...getAllowedOptions(gateType)] : undefined,
    state: payload.state,
  };
}

/**
 * Surface server-side pipeline steps (authoritative tests, typecheck…) in the
 * event stream. These run outside the opencode session, so without explicit
 * events the console sees minutes of silence and reports a false stall.
 */
function emitPipelineNote(
  deps: DevelopmentWorkflowDeps,
  projectId: string,
  kind: "agent.act" | "agent.observe",
  summary: string,
): void {
  deps.onEvent?.(
    emit(deps.db, {
      projectId,
      agentId: "coding",
      payload: { type: kind, projectId, agentId: "coding", summary },
    }),
  );
}

/** Opencode may finish with zero edits when a prior attempt already landed the code — still verify via platform tests. */
function harnessOutcomeAllowsAuthoritativeCheck(sliceResult: {
  passed: boolean;
  summary: string;
}): boolean {
  return (
    sliceResult.passed || sliceResult.summary === OPENCODE_NO_FILE_CHANGES_SUMMARY
  );
}

export async function runSliceIteration(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): Promise<SliceIterationResult> {
  const slice = getCurrentSlice(payload.state);
  if (!slice) {
    throw new Error("No current slice to run");
  }

  ensureDevRepoScaffold(deps.repoPath);

  let state = markSliceInProgress(payload.state, slice);
  const maxAttempts = effectiveMaxSliceAttempts(
    state,
    payload.meta.sliceRetryBudgetExtension ?? 0,
  );

  while (state.currentSliceAttempts < maxAttempts) {
    const attempt = state.currentSliceAttempts + 1;
    const sliceSpec = buildSliceSpec(slice, state, deps.repoPath);

    const sliceResult = await deps.harness.runSlice(sliceSpec, buildHarnessContext(deps, state));

    let check: { passed: boolean; details: string };
    if (harnessOutcomeAllowsAuthoritativeCheck(sliceResult)) {
      if (!sliceResult.passed) {
        emitPipelineNote(
          deps,
          state.projectId,
          "agent.observe",
          "编码 Agent 未改文件（可能上一轮已实现），改由平台权威测试判定是否通过",
        );
      }
      emitPipelineNote(
        deps,
        state.projectId,
        "agent.act",
        `正在运行权威测试验证切片 ${slice.id}（第 ${attempt} 次尝试）— 测试由平台独立执行，请稍候`,
      );
      check = await deps.runAuthoritativeCheck(slice, attempt);
      emitPipelineNote(
        deps,
        state.projectId,
        "agent.observe",
        `权威测试${check.passed ? "通过" : "未通过"}：${check.details}`,
      );
    } else {
      check = { passed: false, details: sliceResult.summary };
    }

    // Slice-boundary typecheck: a slice whose tests pass but breaks the build
    // must fail HERE, not 30 minutes later in the final Testing phase.
    if (check.passed && deps.runSliceTypecheck) {
      emitPipelineNote(deps, state.projectId, "agent.act", "正在运行全仓类型检查（tsc --noEmit）…");
      const typecheck = await deps.runSliceTypecheck();
      if (!typecheck.passed) {
        check = {
          passed: false,
          details: `tests passed but typecheck failed: ${typecheck.details}`,
        };
      }
      emitPipelineNote(
        deps,
        state.projectId,
        "agent.observe",
        typecheck.passed ? "类型检查通过" : `类型检查未通过：${typecheck.details}`,
      );
    }

    const suite = sliceSuiteId(slice.id);
    const status = check.passed ? "passed" : "failed";

    persistRunnerResult(
      deps.db,
      state.projectId,
      { suite, status, details: check.details },
      deps.onEvent,
    );

    state = {
      ...state,
      testResults: [
        ...state.testResults,
        {
          suite,
          status,
          details: check.details,
        },
      ],
    };

    if (check.passed) {
      initRepo(deps.repoPath);
      if (sliceResult.changedFiles.length === 0) {
        const auditPath = path.join(
          deps.repoPath,
          ".onecompany",
          "slices",
          `${slice.id}.json`,
        );
        fs.mkdirSync(path.dirname(auditPath), { recursive: true });
        fs.writeFileSync(
          auditPath,
          JSON.stringify(
            {
              sliceId: slice.id,
              title: slice.title,
              summary: sliceResult.summary,
              authoritative: check.details,
            },
            null,
            2,
          ),
        );
      }
      const commit = commitSlice({
        db: deps.db,
        projectId: state.projectId,
        repoPath: deps.repoPath,
        taskId: slice.id,
        summary: slice.title,
        tests: [slice.testCommand],
      });

      state = markSlicePassed(state, slice.id);
      state = {
        ...state,
        commits: [
          ...state.commits,
          { hash: commit.hash, taskId: slice.id, summary: slice.title },
        ],
      };
      state = captureDiff(deps.db, state, slice.id, deps.onEvent);

      // Persist pass before advisory review — review can hang for minutes and the
      // HTTP slice loop may die without reaching the per-iteration save.
      saveDevSession(deps.db, state.projectId, {
        ...payload,
        state,
        meta: {
          ...payload.meta,
          phase: "slicing",
          currentSliceId: slice.id,
          gateId: undefined,
          gateType: undefined,
        },
      });

      resolveStaleSliceFailureGate(deps.db, state.projectId, "auto_reconciled", deps.onEvent);

      if (deps.harness.runReview) {
        // Same engine as coding, attributed to the "review" role. The verdict
        // is advisory: findings surface in the stream, but a failed parse or
        // disapproval doesn't block the slice (tests already passed).
        try {
          await deps.harness.runReview(
            {
              projectId: state.projectId,
              sliceId: slice.id,
              goal: sliceSpec.goal,
              acceptanceChecks: sliceSpec.acceptanceChecks,
              expectedFiles: sliceSpec.expectedFiles,
              diffSummary: state.diffs.at(-1)?.summary,
              modelTier: sliceSpec.modelTier,
            },
            buildHarnessContext(deps, state, "review"),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          deps.onEvent?.(
            emit(deps.db, {
              projectId: state.projectId,
              agentId: "review",
              payload: {
                type: "agent.observe",
                projectId: state.projectId,
                agentId: "review",
                summary: `审查跳过（引擎错误）：${message.slice(0, 140)}`,
              },
            }),
          );
        }
      } else {
        await deps.runAgent({
          projectId: state.projectId,
          agentIdAtVersion: DEVELOPMENT_AGENT_IDS.review,
          task: {
            state,
            profile: payload.meta.profile,
          },
        });
      }

      return { kind: "passed", state };
    }

    state = incrementSliceAttempts(state);
    if (shouldRaiseSliceFailureGate(state.currentSliceAttempts, maxAttempts, false)) {
      break;
    }
  }

  state = markSliceFailed(state, slice.id);
  const gate = deps.createGate(state.projectId, SLICE_FAILURE_GATE);
  const nextPayload: DevelopmentSessionPayload = {
    ...payload,
    state,
    meta: {
      ...payload.meta,
      phase: "awaiting_gate",
      gateId: gate.id,
      gateType: SLICE_FAILURE_GATE,
      currentSliceId: slice.id,
    },
  };
  saveDevSession(deps.db, state.projectId, nextPayload);
  return { kind: "gate", state, gateId: gate.id };
}

export { isSliceLoopActive } from "./slice-loop-registry.js";

const sliceLoopBackgroundErrors = new Map<string, string>();

export function getSliceLoopBackgroundError(projectId: string): string | undefined {
  return sliceLoopBackgroundErrors.get(projectId);
}

function emitSliceLoopFailure(
  deps: DevelopmentWorkflowDeps,
  projectId: string,
  message: string,
): void {
  try {
    deps.onEvent?.(
      emit(deps.db, {
        projectId,
        payload: {
          type: "run.failed",
          projectId,
          agentId: "coding",
          runId: projectId,
          reason: `开发循环异常终止：${message.slice(0, 300)}`,
        },
      }),
    );
  } catch {
    /* event emission is best-effort during crash handling */
  }
}

/** Run the slice loop on a background task; HTTP handlers return immediately. */
export function beginSliceLoopInBackground(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): DevelopmentRunResult {
  const projectId = payload.state.projectId;
  if (isSliceLoopActive(projectId)) {
    throw new Error(`开发循环正在运行中，无需恢复 — 请等待当前切片完成`);
  }

  sliceLoopBackgroundErrors.delete(projectId);
  markSliceLoopActive(projectId);

  void (async () => {
    try {
      await runSliceLoopUntilHaltInner(deps, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sliceLoopBackgroundErrors.set(projectId, message);
      emitSliceLoopFailure(deps, projectId, message);
    } finally {
      markSliceLoopInactive(projectId);
    }
  })();

  return { ...toResult(deps, payload), running: true };
}

export async function runSliceLoopUntilHalt(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): Promise<DevelopmentRunResult> {
  const projectId = payload.state.projectId;
  if (isSliceLoopActive(projectId)) {
    throw new Error(`Slice loop already running for project: ${projectId}`);
  }
  markSliceLoopActive(projectId);
  try {
    return await runSliceLoopUntilHaltInner(deps, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sliceLoopBackgroundErrors.set(projectId, message);
    emitSliceLoopFailure(deps, projectId, message);
    throw error;
  } finally {
    markSliceLoopInactive(projectId);
  }
}

/**
 * Resume the slice loop of a "Developing" project whose in-memory run died
 * (e.g. the API process restarted mid-slice). Only valid when no gate is
 * pending — gated sessions resume through the gate decision instead.
 */
export async function resumeOrphanedSliceLoop(
  deps: DevelopmentWorkflowDeps,
  projectId: string,
): Promise<DevelopmentRunResult> {
  if (isSliceLoopActive(projectId)) {
    // Resuming on top of a live loop is how slices end up executed twice
    // (observed: every slice of a project ran twice, interleaved).
    throw new Error("开发循环正在运行中，无需恢复 — 请等待当前切片完成");
  }
  if (hasOpenSliceFailureGate(deps.db, projectId)) {
    throw new Error(
      "切片失败门禁仍待处理 — 请在控制台选择「重试该切片」「重新规划切片」等选项，不要点「恢复开发」",
    );
  }
  let payload = loadDevSession(deps.db, projectId);
  if (payload.meta.phase === "awaiting_gate" || payload.meta.phase === "change_review") {
    throw new Error(
      `Development is waiting on a ${payload.meta.gateType ?? "gate"} decision — resolve the gate instead of restarting`,
    );
  }
  if (payload.meta.phase !== "slicing") {
    throw new Error(`Cannot resume development from phase: ${payload.meta.phase}`);
  }

  const reconciled = reconcilePassedSlicesFromCommits(deps.db, payload.state, deps.onEvent);
  if (reconciled !== payload.state) {
    payload = { ...payload, state: reconciled };
    saveDevSession(deps.db, projectId, payload);
  }

  return beginSliceLoopInBackground(deps, payload);
}

/**
 * Close still-open tech_plan_confirm gates once slicing actually starts.
 * Duplicate / superseded gate rows otherwise linger "open" for the whole
 * development run and confuse the console (observed: 64 min stale gate).
 */
function closeStaleTechPlanGates(deps: DevelopmentWorkflowDeps, projectId: string): void {
  deps.db
    .update(humanGates)
    .set({
      status: "resolved",
      decision: "approve",
      resolved_at: new Date().toISOString(),
    })
    .where(
      and(
        eq(humanGates.project_id, projectId),
        eq(humanGates.gate_type, TECH_PLAN_CONFIRM_GATE),
        eq(humanGates.status, "open"),
      ),
    )
    .run();
}

async function runSliceLoopUntilHaltInner(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): Promise<DevelopmentRunResult> {
  let current = {
    ...payload,
    meta: { ...payload.meta, phase: "slicing" as const },
  };
  saveDevSession(deps.db, current.state.projectId, current);
  closeStaleTechPlanGates(deps, current.state.projectId);

  while (hasRunnableSlices(current.state)) {
    const slice = getCurrentSlice(current.state);
    if (!slice) {
      break;
    }

    current = {
      ...current,
      state: resetSliceAttemptsForNewSlice(current.state),
      meta: { ...current.meta, currentSliceId: slice.id },
    };

    const iteration = await runSliceIteration(deps, current);
    current = { ...current, state: iteration.state };

    if (iteration.kind === "gate") {
      return toResult(deps, {
        ...current,
        meta: {
          ...current.meta,
          phase: "awaiting_gate",
          gateId: iteration.gateId,
          gateType: SLICE_FAILURE_GATE,
        },
      });
    }

    saveDevSession(deps.db, current.state.projectId, current);
  }

  if (allSlicesPassed(current.state)) {
    const projectId = current.state.projectId;
    const status = deps.getProjectStatus(projectId);
    if (status === "Developing") {
      deps.setStatus(projectId, "Testing", "development_slices_complete");
    } else {
      // Status moved while the loop ran (e.g. paused). Forcing "Testing" here
      // is an illegal transition and used to crash the loop silently.
      emitPipelineNote(
        deps,
        projectId,
        "agent.observe",
        `切片已全部完成，但项目状态为「${status}」，未自动进入 Testing — 恢复到开发状态后即可进入测试`,
      );
    }
    const completed = updateDevSessionMeta(current, { phase: "completed" });
    saveDevSession(deps.db, projectId, completed);
    return toResult(deps, completed);
  }

  return toResult(deps, current);
}

export async function startDevelopmentLegacy(
  deps: DevelopmentWorkflowDeps,
  input: {
    projectId: string;
    repoPath: string;
    worktreePath?: string;
    profile?: DevFixtureProfile;
  },
): Promise<DevelopmentRunResult> {
  const status = deps.getProjectStatus(input.projectId);
  if (status !== "PRD Ready") {
    throw new Error(`Expected PRD Ready, got ${status}`);
  }

  const prd = loadLatestPrd(deps.db, input.projectId);
  const acceptance = loadLatestAcceptance(deps.db, input.projectId);
  const profile = input.profile ?? "minimal";

  let payload = createDevSession(
    deps.db,
    input.projectId,
    input.repoPath,
    profile,
    input.worktreePath,
  );

  payload = await runArchitect(deps, payload, {
    prd: prd.content,
    acceptance: acceptance.content,
  });
  payload = raiseTechPlanGate(deps, payload);

  return toResult(deps, payload);
}

export async function resumeDevelopmentAfterGateLegacy(
  deps: DevelopmentWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<DevelopmentRunResult> {
  const payload = loadDevSession(deps.db, input.projectId);
  const gateType = payload.meta.gateType;

  if (payload.meta.phase !== "awaiting_gate" && payload.meta.phase !== "change_review") {
    throw new Error(`Expected awaiting_gate or change_review, got ${payload.meta.phase}`);
  }

  switch (gateType) {
    case TECH_PLAN_CONFIRM_GATE:
      return resumeTechPlanGate(deps, payload, input.decision);
    case SLICE_FAILURE_GATE:
      return resumeSliceFailureGate(deps, payload, input.decision);
    case CHANGE_REVIEW_GATE:
      return resumeChangeReviewGate(deps, payload, input.decision);
    default:
      throw new Error(`Unsupported development gate type: ${gateType ?? "none"}`);
  }
}

async function resumeTechPlanGate(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
  decision: string,
): Promise<DevelopmentRunResult> {
  const { effective, customText } = resolveGateDecision(TECH_PLAN_CONFIRM_GATE, decision);
  switch (effective) {
    case "approve": {
      let working = payload;
      if (customText) {
        working = {
          ...working,
          state: {
            ...working.state,
            risks: appendCustomGateNote(working.state.risks, TECH_PLAN_CONFIRM_GATE, customText),
          },
        };
      }
      let next = await runPlanner(deps, working);
      deps.setStatus(next.state.projectId, "Developing", "tech_plan_approved");
      next = {
        ...next,
        meta: { ...next.meta, phase: "slicing", gateId: undefined, gateType: undefined },
      };
      saveDevSession(deps.db, next.state.projectId, next);
      return beginSliceLoopInBackground(deps, next);
    }
    case "reject_and_redo":
    case "revise_then_approve": {
      const prd = loadLatestPrd(deps.db, payload.state.projectId);
      const acceptance = loadLatestAcceptance(deps.db, payload.state.projectId);
      let next = await runArchitect(deps, payload, {
        prd: prd.content,
        acceptance: acceptance.content,
      });
      next = raiseTechPlanGate(deps, next);
      return toResult(deps, next);
    }
    default:
      throw new Error(`Unsupported tech plan gate decision: ${decision}`);
  }
}

async function resumeSliceFailureGate(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
  decision: string,
): Promise<DevelopmentRunResult> {
  switch (decision) {
    case "retry": {
      const sliceId =
        payload.meta.currentSliceId ?? payload.state.currentTask?.id ?? getCurrentSlice(payload.state)?.id;
      if (!sliceId) {
        throw new Error("No slice to retry after slice failure gate");
      }
      const next: DevelopmentSessionPayload = {
        ...payload,
        state: resetSliceForRetry(payload.state, sliceId),
        meta: {
          ...payload.meta,
          phase: "slicing",
          gateId: undefined,
          gateType: undefined,
          currentSliceId: sliceId,
          sliceRetryBudgetExtension:
            (payload.meta.sliceRetryBudgetExtension ?? 0) + SLICE_RETRY_BUDGET_EXTENSION,
        },
      };
      saveDevSession(deps.db, payload.state.projectId, next);
      return beginSliceLoopInBackground(deps, next);
    }
    case "replan": {
      const prd = loadLatestPrd(deps.db, payload.state.projectId);
      const acceptance = loadLatestAcceptance(deps.db, payload.state.projectId);
      let next = await runArchitect(deps, payload, {
        prd: prd.content,
        acceptance: acceptance.content,
      });
      next = raiseTechPlanGate(deps, next);
      return toResult(deps, next);
    }
    case "replan_slices": {
      const sliceId =
        payload.meta.currentSliceId ??
        payload.state.currentTask?.id ??
        getCurrentSlice(payload.state)?.id;
      let next = await runPlanner(deps, payload);
      if (sliceId && next.state.taskQueue.some((task) => task.id === sliceId)) {
        next = { ...next, state: resetSliceForRetry(next.state, sliceId) };
      } else {
        next = {
          ...next,
          state: {
            ...next.state,
            currentSliceAttempts: 0,
            currentTask: next.state.taskQueue.find(
              (task) => (task.status ?? "pending") === "pending",
            ),
          },
        };
      }
      next = {
        ...next,
        meta: {
          ...next.meta,
          phase: "slicing",
          gateId: undefined,
          gateType: undefined,
          currentSliceId: getCurrentSlice(next.state)?.id,
        },
      };
      saveDevSession(deps.db, next.state.projectId, next);
      return beginSliceLoopInBackground(deps, next);
    }
    case "request_skip_slice": {
      const sliceId =
        payload.meta.currentSliceId ?? payload.state.currentTask?.id ?? "unknown-slice";
      const changeRequestId = createSkipChangeRequest(
        deps.db,
        payload.state.projectId,
        sliceId,
        deps.onEvent,
      );
      const next = raiseChangeReviewGate(deps, payload, changeRequestId);
      return toResult(deps, next);
    }
    case "fail": {
      deps.setStatus(payload.state.projectId, "Failed", "development_slice_failure");
      const failed = updateDevSessionMeta(payload, { phase: "failed" });
      saveDevSession(deps.db, payload.state.projectId, failed);
      return toResult(deps, failed);
    }
    default:
      throw new Error(`Unsupported slice failure gate decision: ${decision}`);
  }
}

async function resumeChangeReviewGate(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
  decision: string,
): Promise<DevelopmentRunResult> {
  const next = handleChangeReviewDecision(deps, payload, decision);
  if (decision === "update_plan" || (decision === "reject" && next.meta.phase === "slicing")) {
    return beginSliceLoopInBackground(deps, next);
  }
  if (decision === "revise_tech_plan") {
    const prd = loadLatestPrd(deps.db, payload.state.projectId);
    const acceptance = loadLatestAcceptance(deps.db, payload.state.projectId);
    let replanned = await runArchitect(deps, next, {
      prd: prd.content,
      acceptance: acceptance.content,
    });
    replanned = raiseTechPlanGate(deps, replanned);
    return toResult(deps, replanned);
  }
  return toResult(deps, next);
}

export function getDevelopmentStatus(
  deps: DevelopmentWorkflowDeps,
  projectId: string,
): DevelopmentRunResult {
  const payload = loadDevSession(deps.db, projectId);
  return {
    ...toResult(deps, payload),
    running: isSliceLoopActive(projectId),
    backgroundError: getSliceLoopBackgroundError(projectId),
  };
}
