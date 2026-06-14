import type { IntegrationVerificationArtifact } from "@oc/shared";
import { applyRequirementIntegrations } from "../integrations/requirement-enable.js";
import { persistRunnerResult } from "./results.js";
import { runQaReview } from "./qa.js";
import type { TestingRunResult, TestingWorkflowDeps } from "./types.js";
import { FINAL_SUITE_ORDER } from "./types.js";

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
    integrationArtifacts: payload.testing?.integrationArtifacts,
  };
}

async function resolveEnabledIntegrations(
  deps: TestingWorkflowDeps,
  projectId: string,
): Promise<string[]> {
  const raw = deps.loadRequirementIntegrations?.(projectId) ?? [];
  if (raw.length === 0) {
    return [];
  }
  const { normalizedIntegrations } = await applyRequirementIntegrations(
    { db: deps.db, projectId, onEvent: deps.onEvent },
    raw,
  );
  return normalizedIntegrations;
}

async function collectIntegrationArtifacts(
  deps: TestingWorkflowDeps,
  projectId: string,
  previewUrl: string,
  label: "baseline" | "diagnostic",
  enabledIntegrationIds: string[],
  existing: IntegrationVerificationArtifact[] = [],
): Promise<{ artifacts: IntegrationVerificationArtifact[]; notes: string[] }> {
  if (!deps.runPreviewIntegrationChecks) {
    return { artifacts: existing, notes: [] };
  }
  const summary = await deps.runPreviewIntegrationChecks(
    previewUrl,
    label,
    enabledIntegrationIds,
  );
  if (!summary) {
    return { artifacts: existing, notes: [] };
  }
  return {
    artifacts: [...existing, ...summary.artifacts],
    notes: summary.notes,
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
  const enabledIntegrations = await resolveEnabledIntegrations(deps, input.projectId);

  const baseline = await collectIntegrationArtifacts(
    deps,
    input.projectId,
    preview.url,
    "baseline",
    enabledIntegrations,
  );

  payload = {
    ...payload,
    state: { ...payload.state, previewUrl: preview.url },
    testing: {
      phase: "running",
      requestDeploy: input.requestDeploy ?? false,
      previewUrl: preview.url,
      lastRunAt: new Date().toISOString(),
      suiteResults: [],
      integrationArtifacts: baseline.artifacts,
      integrationNotes: baseline.notes,
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
    const diagnostic = await collectIntegrationArtifacts(
      deps,
      input.projectId,
      preview.url,
      "diagnostic",
      enabledIntegrations,
      payload.testing?.integrationArtifacts ?? [],
    );

    payload = {
      ...payload,
      testing: {
        ...payload.testing!,
        integrationArtifacts: diagnostic.artifacts,
        integrationNotes: [
          ...(payload.testing?.integrationNotes ?? []),
          ...diagnostic.notes,
        ],
      },
    };
    deps.saveSession(input.projectId, payload);

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
        requestDeploy: input.requestDeploy ?? false,
        previewUrl: preview.url,
        lastRunAt: new Date().toISOString(),
        suiteResults,
        qaNotes,
        integrationArtifacts: diagnostic.artifacts,
        integrationNotes: payload.testing?.integrationNotes,
      },
    };
    deps.saveSession(input.projectId, payload);
    deps.setStatus(input.projectId, "Developing", "testing_suite_failed");
    return toResult(deps, payload);
  }

  const repairedFinalFailure = Boolean(payload.meta.finalRepair);
  const qaNotes = repairedFinalFailure ? await runQaReview(deps, payload, []) : undefined;

  const nextStatus = input.requestDeploy ? "Deploying" : "Awaiting Acceptance";
  deps.setStatus(
    input.projectId,
    nextStatus,
    input.requestDeploy ? "testing_passed_request_deploy" : "testing_passed",
  );

  payload = {
    ...payload,
    meta: repairedFinalFailure
      ? { ...payload.meta, finalRepair: undefined }
      : payload.meta,
    testing: {
      phase: "passed",
      requestDeploy: input.requestDeploy ?? false,
      previewUrl: preview.url,
      lastRunAt: new Date().toISOString(),
      suiteResults,
      qaNotes,
      integrationArtifacts: baseline.artifacts,
      integrationNotes: baseline.notes,
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
