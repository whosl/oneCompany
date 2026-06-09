import { getAllowedOptions } from "@oc/shared";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";
import {
  createSkipChangeRequest,
  handleChangeReviewDecision,
  raiseChangeReviewGate,
} from "./change-review.js";
import { runSliceLoopUntilHalt } from "./engine-legacy.js";
import { runPlanner } from "./planner.js";
import {
  createDevSession,
  loadDevSession,
  resetSliceAttemptsForNewSlice,
  saveDevSession,
  updateDevSessionMeta,
} from "./state.js";
import { raiseTechPlanGate, runArchitect } from "./tech-plan.js";
import type {
  DevelopmentRunResult,
  DevelopmentSessionPayload,
  DevelopmentWorkflowDeps,
} from "./types.js";
import {
  CHANGE_REVIEW_GATE,
  SLICE_FAILURE_GATE,
  SLICE_RETRY_BUDGET_EXTENSION,
  TECH_PLAN_CONFIRM_GATE,
} from "./types.js";
import { resolveGraphCheckpointer } from "../graph/checkpointer.js";
import type { DevFixtureProfile } from "@oc/agent-core";

const DevelopmentGraphAnnotation = Annotation.Root({
  payload: Annotation<DevelopmentSessionPayload>,
  result: Annotation<DevelopmentRunResult | undefined>,
});

type DevelopmentGraphState = typeof DevelopmentGraphAnnotation.State;

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

export function useGraphDevelopmentEngine(): boolean {
  return process.env.OC_USE_LEGACY_ENGINE !== "1";
}

export function buildDevelopmentGraph(deps: DevelopmentWorkflowDeps) {
  const architectNode = async (
    state: DevelopmentGraphState,
  ): Promise<Partial<DevelopmentGraphState>> => {
    const prd = loadLatestPrd(deps.db, state.payload.state.projectId);
    const acceptance = loadLatestAcceptance(deps.db, state.payload.state.projectId);
    const next = await runArchitect(deps, state.payload, {
      prd: prd.content,
      acceptance: acceptance.content,
    });
    const gated = raiseTechPlanGate(deps, next);
    return { payload: gated };
  };

  const waitTechPlanGateNode = async (
    state: DevelopmentGraphState,
  ): Promise<Partial<DevelopmentGraphState>> => {
    const decision = interrupt({
      type: TECH_PLAN_CONFIRM_GATE,
      gateId: state.payload.meta.gateId,
    }) as string;

    let payload = { ...state.payload };
    switch (decision) {
      case "approve": {
        payload = await runPlanner(deps, payload);
        deps.setStatus(payload.state.projectId, "Developing", "tech_plan_approved");
        payload = {
          ...payload,
          meta: { ...payload.meta, phase: "slicing", gateId: undefined, gateType: undefined },
        };
        saveDevSession(deps.db, payload.state.projectId, payload);
        const loopResult = await runSliceLoopUntilHalt(deps, payload);
        const loaded = loadDevSession(deps.db, payload.state.projectId);
        if (loopResult.phase === "completed" || loopResult.phase === "failed") {
          return { payload: loaded, result: loopResult };
        }
        return { payload: loaded };
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
        return { payload: next };
      }
      default:
        throw new Error(`Unsupported tech plan gate decision: ${decision}`);
    }
  };

  const waitSliceFailureGateNode = async (
    state: DevelopmentGraphState,
  ): Promise<Partial<DevelopmentGraphState>> => {
    const decision = interrupt({
      type: SLICE_FAILURE_GATE,
      gateId: state.payload.meta.gateId,
    }) as string;

    let payload = { ...state.payload };
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
        const loopResult = await runSliceLoopUntilHalt(deps, next);
        return { payload: loadDevSession(deps.db, payload.state.projectId), result: loopResult };
      }
      case "replan": {
        const prd = loadLatestPrd(deps.db, payload.state.projectId);
        const acceptance = loadLatestAcceptance(deps.db, payload.state.projectId);
        let next = await runArchitect(deps, payload, {
          prd: prd.content,
          acceptance: acceptance.content,
        });
        next = raiseTechPlanGate(deps, next);
        return { payload: next };
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
        return { payload: next };
      }
      case "fail": {
        deps.setStatus(payload.state.projectId, "Failed", "development_slice_failure");
        const failed = updateDevSessionMeta(payload, { phase: "failed" });
        saveDevSession(deps.db, payload.state.projectId, failed);
        return { payload: failed, result: toResult(deps, failed) };
      }
      default:
        throw new Error(`Unsupported slice failure gate decision: ${decision}`);
    }
  };

  const waitChangeReviewGateNode = async (
    state: DevelopmentGraphState,
  ): Promise<Partial<DevelopmentGraphState>> => {
    const decision = interrupt({
      type: CHANGE_REVIEW_GATE,
      gateId: state.payload.meta.gateId,
    }) as string;

    const next = handleChangeReviewDecision(deps, state.payload, decision);
    if (decision === "update_plan") {
      const loopResult = await runSliceLoopUntilHalt(deps, next);
      return { payload: loadDevSession(deps.db, next.state.projectId), result: loopResult };
    }
    if (decision === "revise_tech_plan") {
      const prd = loadLatestPrd(deps.db, next.state.projectId);
      const acceptance = loadLatestAcceptance(deps.db, next.state.projectId);
      let replanned = await runArchitect(deps, next, {
        prd: prd.content,
        acceptance: acceptance.content,
      });
      replanned = raiseTechPlanGate(deps, replanned);
      return { payload: replanned };
    }
    return { payload: next, result: toResult(deps, next) };
  };

  const routeAfterTechPlan = (state: DevelopmentGraphState): string => {
    if (state.result) {
      return END;
    }
    if (state.payload.meta.gateType === SLICE_FAILURE_GATE) {
      return "waitSliceFailureGate";
    }
    if (state.payload.meta.gateType === CHANGE_REVIEW_GATE) {
      return "waitChangeReviewGate";
    }
    return "waitTechPlanGate";
  };

  const routeAfterGateResume = (state: DevelopmentGraphState): string => {
    if (state.result) {
      return END;
    }
    if (state.payload.meta.gateType === TECH_PLAN_CONFIRM_GATE) {
      return "waitTechPlanGate";
    }
    if (state.payload.meta.gateType === CHANGE_REVIEW_GATE) {
      return "waitChangeReviewGate";
    }
    if (state.payload.meta.gateType === SLICE_FAILURE_GATE) {
      return "waitSliceFailureGate";
    }
    return END;
  };

  const graph = new StateGraph(DevelopmentGraphAnnotation)
    .addNode("architect", architectNode)
    .addNode("waitTechPlanGate", waitTechPlanGateNode)
    .addNode("waitSliceFailureGate", waitSliceFailureGateNode)
    .addNode("waitChangeReviewGate", waitChangeReviewGateNode)
    .addEdge(START, "architect")
    .addEdge("architect", "waitTechPlanGate")
    .addConditionalEdges("waitTechPlanGate", routeAfterTechPlan)
    .addConditionalEdges("waitSliceFailureGate", routeAfterGateResume)
    .addConditionalEdges("waitChangeReviewGate", routeAfterGateResume);

  return graph.compile({ checkpointer: resolveGraphCheckpointer() });
}

function graphConfig(projectId: string) {
  return { configurable: { thread_id: `dev:${projectId}` } };
}

export async function startDevelopmentGraph(
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

  const profile = input.profile ?? "minimal";
  let payload = createDevSession(
    deps.db,
    input.projectId,
    input.repoPath,
    profile,
    input.worktreePath,
  );

  const graph = buildDevelopmentGraph(deps);
  const finalState = (await graph.invoke(
    { payload },
    graphConfig(input.projectId),
  )) as DevelopmentGraphState;

  if (finalState.result) {
    return finalState.result;
  }

  return toResult(deps, finalState.payload);
}

export async function resumeDevelopmentAfterGateGraph(
  deps: DevelopmentWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<DevelopmentRunResult> {
  const payload = loadDevSession(deps.db, input.projectId);
  if (payload.meta.phase !== "awaiting_gate" && payload.meta.phase !== "change_review") {
    throw new Error(`Expected awaiting_gate or change_review, got ${payload.meta.phase}`);
  }

  const graph = buildDevelopmentGraph(deps);
  const finalState = (await graph.invoke(
    new Command({ resume: input.decision }),
    graphConfig(input.projectId),
  )) as DevelopmentGraphState;

  if (finalState.result) {
    return finalState.result;
  }

  return toResult(deps, finalState.payload);
}
