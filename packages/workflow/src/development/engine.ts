import type { DevFixtureProfile } from "@oc/agent-core";
import type { DevelopmentRunResult, DevelopmentWorkflowDeps } from "./types.js";
import {
  resumeDevelopmentAfterGateGraph,
  startDevelopmentGraph,
  useGraphDevelopmentEngine,
} from "./graph.js";
import {
  getDevelopmentStatus as getDevelopmentStatusLegacy,
  resumeDevelopmentAfterGateLegacy,
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
