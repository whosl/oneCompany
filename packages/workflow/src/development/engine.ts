import type { DevFixtureProfile } from "@oc/agent-core";
import type { DevelopmentRunResult, DevelopmentWorkflowDeps } from "./types.js";
import { startFinalRepair } from "./final-repair.js";
import { loadDevSession } from "./state.js";
import {
  resumeDevelopmentAfterGateGraph,
  startDevelopmentGraph,
  useGraphDevelopmentEngine,
} from "./graph.js";
import {
  getDevelopmentStatus as getDevelopmentStatusLegacy,
  resumeDevelopmentAfterGateLegacy,
  resumeOrphanedSliceLoop,
  runSliceIteration as runSliceIterationLegacy,
  startDevelopmentLegacy,
} from "./engine-legacy.js";

export { runSliceIterationLegacy as runSliceIteration };

export async function startDevelopment(
  deps: DevelopmentWorkflowDeps,
  input: {
    projectId: string;
    repoPath: string;
    worktreePath?: string;
    profile?: DevFixtureProfile;
  },
): Promise<DevelopmentRunResult> {
  // A "Developing" project whose in-memory slice loop died (API restart /
  // crash) can be resumed from the persisted dev session. The session payload
  // is engine-agnostic, so the legacy slice loop resumes either engine's run.
  if (deps.getProjectStatus(input.projectId) === "Developing") {
    const payload = loadDevSession(deps.db, input.projectId);
    if (payload.meta.phase === "completed" && payload.testing?.phase === "failed") {
      return startFinalRepair(deps, {
        projectId: input.projectId,
        suiteResults: payload.testing.suiteResults,
        qaNotes: payload.testing.qaNotes,
        requestDeploy: payload.testing.requestDeploy,
      });
    }
    return resumeOrphanedSliceLoop(deps, input.projectId);
  }
  if (useGraphDevelopmentEngine()) {
    return startDevelopmentGraph(deps, input);
  }
  return startDevelopmentLegacy(deps, input);
}

export async function resumeDevelopmentAfterGate(
  deps: DevelopmentWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<DevelopmentRunResult> {
  if (useGraphDevelopmentEngine()) {
    return resumeDevelopmentAfterGateGraph(deps, input);
  }
  return resumeDevelopmentAfterGateLegacy(deps, input);
}

export function getDevelopmentStatus(
  deps: DevelopmentWorkflowDeps,
  projectId: string,
): DevelopmentRunResult {
  return getDevelopmentStatusLegacy(deps, projectId);
}
