import { appendCustomGateNote, getAllowedOptions, resolveGateDecision } from "@oc/shared";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import type { DevFixtureProfile } from "@oc/agent-core";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";
import {
  createSkipChangeRequest,
  handleChangeReviewDecision,
  raiseChangeReviewGate,
} from "./change-review.js";
import { resumeDevelopmentAfterGateLegacy, runSliceIteration } from "./engine-legacy.js";
import { runPlanner } from "./planner.js";
import { allSlicesPassed, getCurrentSlice, hasRunnableSlices } from "./slice-policy.js";
import {
  createDevSession,
  loadDevSession,
  resetSliceAttemptsForNewSlice,
  resetSliceForRetry,
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
import { hasGraphCheckpoint, resolveGraphCheckpointer } from "../graph/checkpointer.js";

const DevelopmentGraphAnnotation = Annotation.Root({
  payload: Annotation<DevelopmentSessionPayload>,
  result: Annotation<DevelopmentRunResult | undefined>,
});

type DevelopmentGraphState = typeof DevelopmentGraphAnnotation.State;

// Each slice runs as one graph super-step; allow long slice queues plus gate
// round-trips before LangGraph's recursion guard trips.
const GRAPH_RECURSION_LIMIT = 150;

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
    const { effective, customText } = resolveGateDecision(TECH_PLAN_CONFIRM_GATE, decision);
    switch (effective) {
      case "approve": {
        if (customText) {
          payload = {
            ...payload,
            state: {
              ...payload.state,
              risks: appendCustomGateNote(payload.state.risks, TECH_PLAN_CONFIRM_GATE, customText),
            },
          };
        }
        payload = await runPlanner(deps, payload);
        deps.setStatus(payload.state.projectId, "Developing", "tech_plan_approved");
        payload = {
          ...payload,
          meta: { ...payload.meta, phase: "slicing", gateId: undefined, gateType: undefined },
        };
        saveDevSession(deps.db, payload.state.projectId, payload);
        return { payload };
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

  // One pending slice per visit; runSliceIteration owns the per-slice retry loop
  // and raises the slice-failure gate when the attempt budget is exhausted.
  const sliceNode = async (
    state: DevelopmentGraphState,
  ): Promise<Partial<DevelopmentGraphState>> => {
    let current: DevelopmentSessionPayload = {
      ...state.payload,
      meta: { ...state.payload.meta, phase: "slicing" },
    };

    const slice = getCurrentSlice(current.state);
    if (!slice) {
      return { payload: current };
    }

    current = {
      ...current,
      state: resetSliceAttemptsForNewSlice(current.state),
      meta: { ...current.meta, currentSliceId: slice.id },
    };

    const iteration = await runSliceIteration(deps, current);
    current = { ...current, state: iteration.state };

    if (iteration.kind === "gate") {
      const gated: DevelopmentSessionPayload = {
        ...current,
        meta: {
          ...current.meta,
          phase: "awaiting_gate",
          gateId: iteration.gateId,
          gateType: SLICE_FAILURE_GATE,
        },
      };
      return { payload: gated };
    }

    saveDevSession(deps.db, current.state.projectId, current);
    return { payload: current };
  };

  const finalizeNode = async (
    state: DevelopmentGraphState,
  ): Promise<Partial<DevelopmentGraphState>> => {
    const current = { ...state.payload };
    if (allSlicesPassed(current.state)) {
      const projectId = current.state.projectId;
      // Status may have moved while slices ran (e.g. paused); forcing
      // "Testing" then is an illegal transition that kills the loop silently.
      if (deps.getProjectStatus(projectId) === "Developing") {
        deps.setStatus(projectId, "Testing", "development_slices_complete");
      }
      const completed = updateDevSessionMeta(current, { phase: "completed" });
      saveDevSession(deps.db, projectId, completed);
      return { payload: completed, result: toResult(deps, completed) };
    }
    return { payload: current, result: toResult(deps, current) };
  };

  const waitSliceFailureGateNode = async (
    state: DevelopmentGraphState,
  ): Promise<Partial<DevelopmentGraphState>> => {
    const decision = interrupt({
      type: SLICE_FAILURE_GATE,
      gateId: state.payload.meta.gateId,
    }) as string;

    const payload = { ...state.payload };
    switch (decision) {
      case "retry": {
        const sliceId =
          payload.meta.currentSliceId ??
          payload.state.currentTask?.id ??
          getCurrentSlice(payload.state)?.id;
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
        return { payload: next };
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
    if (decision === "update_plan" || (decision === "reject" && next.meta.phase === "slicing")) {
      return { payload: next };
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

  // Shared router for nodes that hand control back via meta.gateType / phase.
  const routeByState = (state: DevelopmentGraphState): string => {
    if (state.result) {
      return END;
    }
    const gateType = state.payload.meta.gateType;
    if (gateType === TECH_PLAN_CONFIRM_GATE) {
      return "waitTechPlanGate";
    }
    if (gateType === SLICE_FAILURE_GATE) {
      return "waitSliceFailureGate";
    }
    if (gateType === CHANGE_REVIEW_GATE) {
      return "waitChangeReviewGate";
    }
    if (state.payload.meta.phase === "slicing") {
      return hasRunnableSlices(state.payload.state) ? "sliceNode" : "finalize";
    }
    return END;
  };

  const routeAfterSlice = (state: DevelopmentGraphState): string => {
    if (state.payload.meta.gateType === SLICE_FAILURE_GATE) {
      return "waitSliceFailureGate";
    }
    if (hasRunnableSlices(state.payload.state)) {
      return "sliceNode";
    }
    return "finalize";
  };

  const graph = new StateGraph(DevelopmentGraphAnnotation)
    .addNode("architect", architectNode)
    .addNode("waitTechPlanGate", waitTechPlanGateNode)
    .addNode("sliceNode", sliceNode)
    .addNode("finalize", finalizeNode)
    .addNode("waitSliceFailureGate", waitSliceFailureGateNode)
    .addNode("waitChangeReviewGate", waitChangeReviewGateNode)
    .addEdge(START, "architect")
    .addEdge("architect", "waitTechPlanGate")
    .addConditionalEdges("waitTechPlanGate", routeByState)
    .addConditionalEdges("sliceNode", routeAfterSlice)
    .addEdge("finalize", END)
    .addConditionalEdges("waitSliceFailureGate", routeByState)
    .addConditionalEdges("waitChangeReviewGate", routeByState);

  return graph.compile({ checkpointer: resolveGraphCheckpointer() });
}

function graphConfig(projectId: string) {
  return {
    configurable: { thread_id: `dev:${projectId}` },
    recursionLimit: GRAPH_RECURSION_LIMIT,
  };
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
  const payload = createDevSession(
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

  if (!(await hasGraphCheckpoint(`dev:${input.projectId}`))) {
    return resumeDevelopmentAfterGateLegacy(deps, input);
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
