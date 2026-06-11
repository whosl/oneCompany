import type { RequirementFixtureProfile } from "@oc/agent-core";
import type { RequirementRunResult, RequirementWorkflowDeps } from "./types.js";
import {
  resumeRequirementAfterGateGraph,
  skipRequirementClarificationGraph,
  startRequirementGraph,
  submitRequirementAnswersGraph,
  useGraphRequirementEngine,
} from "./graph.js";
import {
  resumeRequirementAfterGateLegacy,
  skipRequirementClarificationLegacy,
  startRequirementLegacy,
  submitRequirementAnswersLegacy,
} from "./engine-legacy.js";

export async function startRequirement(
  deps: RequirementWorkflowDeps,
  input: {
    projectId: string;
    requirement: string;
    profile?: RequirementFixtureProfile;
  },
): Promise<RequirementRunResult> {
  if (useGraphRequirementEngine()) {
    return startRequirementGraph(deps, input);
  }
  return startRequirementLegacy(deps, input);
}

export async function submitRequirementAnswers(
  deps: RequirementWorkflowDeps,
  input: { projectId: string; answers: string[] },
): Promise<RequirementRunResult> {
  if (useGraphRequirementEngine()) {
    return submitRequirementAnswersGraph(deps, input);
  }
  return submitRequirementAnswersLegacy(deps, input);
}

export async function skipRequirementClarification(
  deps: RequirementWorkflowDeps,
  input: { projectId: string },
): Promise<RequirementRunResult> {
  if (useGraphRequirementEngine()) {
    return skipRequirementClarificationGraph(deps, input);
  }
  return skipRequirementClarificationLegacy(deps, input);
}

export async function resumeRequirementAfterGate(
  deps: RequirementWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<RequirementRunResult> {
  if (useGraphRequirementEngine()) {
    return resumeRequirementAfterGateGraph(deps, input);
  }
  return resumeRequirementAfterGateLegacy(deps, input);
}
