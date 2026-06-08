import { QaOutputSchema } from "@oc/shared";
import { DEVELOPMENT_AGENT_IDS } from "@oc/agent-core";
import type { DevelopmentSessionPayload } from "../development/types.js";
import type { TestingWorkflowDeps } from "./types.js";

export async function runQaReview(
  deps: TestingWorkflowDeps,
  payload: DevelopmentSessionPayload,
  failedSuites: string[],
): Promise<string[]> {
  const previewUrl = payload.state.previewUrl ?? payload.testing?.previewUrl;
  const result = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: DEVELOPMENT_AGENT_IDS.qa,
    task: {
      state: payload.state,
      profile: payload.meta.profile,
      testingContext: {
        failedSuites,
        previewUrl,
      },
    },
  });

  const parsed = QaOutputSchema.parse(result.output);
  return parsed.notes;
}
