import { PlannerOutputSchema } from "@oc/shared";
import { DEVELOPMENT_AGENT_IDS } from "@oc/agent-core";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";
import { saveDevSession } from "./state.js";
import type { DevelopmentSessionPayload, DevelopmentWorkflowDeps } from "./types.js";

export async function runPlanner(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): Promise<DevelopmentSessionPayload> {
  const prd = loadLatestPrd(deps.db, payload.state.projectId);
  const acceptance = loadLatestAcceptance(deps.db, payload.state.projectId);

  await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: DEVELOPMENT_AGENT_IDS.testDesigner,
    task: {
      state: payload.state,
      profile: payload.meta.profile,
      prd: prd.content,
      acceptance: acceptance.content,
      techPlan: payload.state.techPlanVersion,
    },
  });

  const plannerResult = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: DEVELOPMENT_AGENT_IDS.planner,
    task: {
      state: payload.state,
      profile: payload.meta.profile,
      prd: prd.content,
      acceptance: acceptance.content,
      techPlan: payload.state.techPlanVersion,
    },
  });

  const parsed = PlannerOutputSchema.parse(plannerResult.output);
  const taskQueue = parsed.slices.map((slice) => ({
    ...slice,
    status: "pending" as const,
  }));
  const currentTask = taskQueue[0];

  const next: DevelopmentSessionPayload = {
    ...payload,
    state: {
      ...payload.state,
      taskQueue,
      currentTask,
      currentSliceAttempts: 0,
    },
    meta: {
      ...payload.meta,
      phase: "planning",
      currentSliceId: currentTask?.id,
    },
  };

  saveDevSession(deps.db, payload.state.projectId, next);
  return next;
}
