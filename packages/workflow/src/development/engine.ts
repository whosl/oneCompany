import fs from "node:fs";
import path from "node:path";
import { commitSlice, initRepo } from "@oc/workspace";
import { emit, getAllowedOptions } from "@oc/shared";
import { DEVELOPMENT_AGENT_IDS } from "@oc/agent-core";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";
import {
  createSkipChangeRequest,
  handleChangeReviewDecision,
  raiseChangeReviewGate,
} from "./change-review.js";
import { captureDiff } from "./diffs.js";
import { runPlanner } from "./planner.js";
import {
  allSlicesPassed,
  effectiveMaxSliceAttempts,
  getCurrentSlice,
  hasPendingSlices,
  shouldRaiseSliceFailureGate,
} from "./slice-policy.js";
import {
  createDevSession,
  incrementSliceAttempts,
  loadDevSession,
  markSliceInProgress,
  markSlicePassed,
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

export async function runSliceIteration(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): Promise<SliceIterationResult> {
  const slice = getCurrentSlice(payload.state);
  if (!slice) {
    throw new Error("No current slice to run");
  }

  let state = markSliceInProgress(payload.state, slice);
  const maxAttempts = effectiveMaxSliceAttempts(
    state,
    payload.meta.sliceRetryBudgetExtension ?? 0,
  );

  while (state.currentSliceAttempts < maxAttempts) {
    const attempt = state.currentSliceAttempts + 1;
    const sliceSpec = buildSliceSpec(slice, state);

    await deps.harness.runSlice(sliceSpec, buildHarnessContext(deps, state));

    const check = await deps.runAuthoritativeCheck(slice, attempt);
    const envelope = emit(deps.db, {
      projectId: state.projectId,
      payload: {
        type: "test.result",
        projectId: state.projectId,
        suite: slice.id,
        status: check.passed ? "passed" : "failed",
      },
    });
    deps.onEvent?.(envelope);

    state = {
      ...state,
      testResults: [
        ...state.testResults,
        {
          suite: slice.id,
          status: check.passed ? "passed" : "failed",
          details: check.details,
        },
      ],
    };

    if (check.passed) {
      initRepo(deps.repoPath);
      const markerPath = path.join(deps.repoPath, "src", `${slice.id}.ts`);
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, `// slice ${slice.id}: ${slice.title}\n`);
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

      await deps.runAgent({
        projectId: state.projectId,
        agentIdAtVersion: DEVELOPMENT_AGENT_IDS.review,
        task: {
          state,
          profile: payload.meta.profile,
        },
      });

      return { kind: "passed", state };
    }

    state = incrementSliceAttempts(state);
    if (shouldRaiseSliceFailureGate(state.currentSliceAttempts, maxAttempts, false)) {
      break;
    }
  }

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

async function runSliceLoopUntilHalt(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): Promise<DevelopmentRunResult> {
  let current = {
    ...payload,
    meta: { ...payload.meta, phase: "slicing" as const },
  };
  saveDevSession(deps.db, current.state.projectId, current);

  while (hasPendingSlices(current.state)) {
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
  }

  if (allSlicesPassed(current.state)) {
    deps.setStatus(current.state.projectId, "Testing", "development_slices_complete");
    const completed = updateDevSessionMeta(current, { phase: "completed" });
    saveDevSession(deps.db, current.state.projectId, completed);
    return toResult(deps, completed);
  }

  return toResult(deps, current);
}

export async function startDevelopment(
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

export async function resumeDevelopmentAfterGate(
  deps: DevelopmentWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<DevelopmentRunResult> {
  let payload = loadDevSession(deps.db, input.projectId);
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
  switch (decision) {
    case "approve": {
      let next = await runPlanner(deps, payload);
      deps.setStatus(next.state.projectId, "Developing", "tech_plan_approved");
      next = {
        ...next,
        meta: { ...next.meta, phase: "slicing", gateId: undefined, gateType: undefined },
      };
      saveDevSession(deps.db, next.state.projectId, next);
      return runSliceLoopUntilHalt(deps, next);
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
      const next: DevelopmentSessionPayload = {
        ...payload,
        state: resetSliceAttemptsForNewSlice(payload.state),
        meta: {
          ...payload.meta,
          phase: "slicing",
          gateId: undefined,
          gateType: undefined,
          sliceRetryBudgetExtension:
            (payload.meta.sliceRetryBudgetExtension ?? 0) + SLICE_RETRY_BUDGET_EXTENSION,
        },
      };
      saveDevSession(deps.db, payload.state.projectId, next);
      return runSliceLoopUntilHalt(deps, next);
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
  if (decision === "update_plan") {
    return runSliceLoopUntilHalt(deps, next);
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
  return toResult(deps, payload);
}
