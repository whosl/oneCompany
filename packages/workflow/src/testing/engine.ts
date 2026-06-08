import type { TestingSessionMeta } from "@oc/shared";
import { persistRunnerResult } from "./results.js";
import { runQaReview } from "./qa.js";
import type { TestingRunResult, TestingWorkflowDeps } from "./types.js";
import { FINAL_SUITE_ORDER } from "./types.js";

function createInitialTestingMeta(): TestingSessionMeta {
  return {
    phase: "idle",
    suiteResults: [],
  };
}

function toResult(
  deps: TestingWorkflowDeps,
  payload: import("../development/types.js").DevelopmentSessionPayload,
): TestingRunResult {
  return {
    phase: payload.testing?.phase ?? "idle",
    projectStatus: deps.getProjectStatus(payload.state.projectId),
    previewUrl: payload.state.previewUrl ?? payload.testing?.previewUrl,
    suiteResults: payload.testing?.suiteResults ?? [],
    state: payload.state,
    qaNotes: payload.testing?.qaNotes,
  };
}

export async function runTestingPhase(
  deps: TestingWorkflowDeps,
  input: { projectId: string; requestDeploy?: boolean },
): Promise<TestingRunResult> {
  const status = deps.getProjectStatus(input.projectId);
  if (status !== "Testing") {
    throw new Error(`Expected Testing, got ${status}`);
  }

  let payload = deps.loadSession(input.projectId);
  const preview = await deps.startPreview(input.projectId);

  payload = {
    ...payload,
    state: { ...payload.state, previewUrl: preview.url },
    testing: {
      phase: "running",
      previewUrl: preview.url,
      lastRunAt: new Date().toISOString(),
      suiteResults: [],
    },
  };
  deps.saveSession(input.projectId, payload);

  const suiteResults = [];
  let failed = false;

  for (const suite of FINAL_SUITE_ORDER) {
    const result = await deps.runSuite(
      suite,
      suite === "final:playwright" ? preview.url : undefined,
    );
    suiteResults.push(result);
    persistRunnerResult(deps.db, input.projectId, result, deps.onEvent);

    if (result.status === "failed") {
      failed = true;
      break;
    }
  }

  if (failed) {
    const failedSuites = suiteResults
      .filter((r) => r.status === "failed")
      .map((r) => r.suite);
    const qaNotes = await runQaReview(deps, payload, failedSuites);

    payload = {
      ...payload,
      state: {
        ...payload.state,
        risks: [...payload.state.risks, ...qaNotes.map((n) => `QA: ${n}`)],
      },
      testing: {
        phase: "failed",
        previewUrl: preview.url,
        lastRunAt: new Date().toISOString(),
        suiteResults,
        qaNotes,
      },
    };
    deps.saveSession(input.projectId, payload);
    deps.setStatus(input.projectId, "Developing", "testing_suite_failed");
    return toResult(deps, payload);
  }

  const nextStatus = input.requestDeploy ? "Deploying" : "Awaiting Acceptance";
  deps.setStatus(
    input.projectId,
    nextStatus,
    input.requestDeploy ? "testing_passed_request_deploy" : "testing_passed",
  );

  payload = {
    ...payload,
    testing: {
      phase: "passed",
      previewUrl: preview.url,
      lastRunAt: new Date().toISOString(),
      suiteResults,
    },
  };
  deps.saveSession(input.projectId, payload);

  return toResult(deps, payload);
}

export function getTestingStatus(
  deps: TestingWorkflowDeps,
  projectId: string,
): TestingRunResult {
  const payload = deps.loadSession(projectId);
  return toResult(deps, payload);
}

export function assertPreviewBeforePlaywright(previewUrl?: string): void {
  if (!previewUrl) {
    throw new Error("Playwright requires preview URL before final E2E");
  }
}

export { FINAL_SUITE_ORDER as getFinalSuiteOrder };
