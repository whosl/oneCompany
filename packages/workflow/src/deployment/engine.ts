import { randomUUID } from "node:crypto";
import { appendCustomGateNote, deployments, emit, resolveGateDecision } from "@oc/shared";
import { assertWebLayerDelivered } from "@oc/workspace";
import { loadDevSession, saveDevSession } from "../development/state.js";
import type { DevelopmentSessionPayload } from "../development/types.js";
import type { DeploymentRunResult, DeploymentWorkflowDeps } from "./types.js";

/** URL staged for deployment: explicit submit > testing preview > dev preview. */
function resolveStagedDeploymentUrl(payload: DevelopmentSessionPayload): string | undefined {
  return (
    payload.deployment?.pendingUrl?.trim() ||
    payload.state.previewUrl?.trim() ||
    payload.testing?.previewUrl?.trim() ||
    undefined
  );
}

export function startDeploymentPhase(
  deps: DeploymentWorkflowDeps,
  input: { projectId: string },
): DeploymentRunResult {
  const status = deps.getProjectStatus(input.projectId);
  if (status !== "Deploying") {
    throw new Error(`Expected Deploying, got ${status}`);
  }

  const payload = deps.loadSession(input.projectId);
  if (payload.deployment?.phase === "awaiting_gate" && payload.deployment.gateId) {
    return toResult(deps, payload);
  }

  const gate = deps.createGate(input.projectId, "deployment");
  const envelope = emit(deps.db, {
    projectId: input.projectId,
    payload: { type: "deployment.started", projectId: input.projectId },
  });
  deps.onEvent?.(envelope);

  const stagedUrl = resolveStagedDeploymentUrl(payload);
  const next = {
    ...payload,
    deployment: {
      phase: "awaiting_gate" as const,
      gateId: gate.id,
      ...(stagedUrl ? { pendingUrl: stagedUrl } : {}),
    },
  };
  deps.saveSession(input.projectId, next);
  return toResult(deps, next);
}

export function submitDeploymentUrl(
  deps: DeploymentWorkflowDeps,
  input: { projectId: string; url: string },
): DeploymentRunResult {
  const url = input.url.trim();
  if (!url) {
    throw new Error("Deployment URL is required");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Deployment URL must start with http:// or https://");
  }

  const payload = deps.loadSession(input.projectId);
  if (payload.deployment?.phase !== "awaiting_gate") {
    throw new Error("Deployment gate is not awaiting URL submission");
  }

  const next = {
    ...payload,
    deployment: {
      ...payload.deployment,
      pendingUrl: url,
    },
  };
  deps.saveSession(input.projectId, next);
  return toResult(deps, next);
}

export async function handleDeploymentGateDecision(
  deps: DeploymentWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<DeploymentRunResult> {
  const payload = deps.loadSession(input.projectId);
  if (payload.deployment?.phase !== "awaiting_gate") {
    throw new Error("No deployment gate awaiting decision");
  }

  const { effective, customText } = resolveGateDecision("deployment", input.decision);

  if (effective === "reject") {
    const next = {
      ...payload,
      state: {
        ...payload.state,
        risks: [...payload.state.risks, "Deployment rejected by user"],
      },
      deployment: { phase: "idle" as const },
    };
    deps.saveSession(input.projectId, next);
    return toResult(deps, next);
  }

  if (effective !== "approve") {
    throw new Error(`Unsupported deployment decision: ${input.decision}`);
  }

  const url = resolveStagedDeploymentUrl(payload);
  if (!url) {
    throw new Error(
      "Deployment URL must be submitted before approval — paste the preview URL in the composer or say it to Taizi first",
    );
  }

  const webLayer = assertWebLayerDelivered(payload.state.repoPath, { allowPlaceholder: false });
  if (!webLayer.ok) {
    throw new Error(`Deployment blocked — ${webLayer.details}`);
  }

  const now = new Date().toISOString();
  const deploymentId = randomUUID();
  deps.db
    .insert(deployments)
    .values({
      id: deploymentId,
      project_id: input.projectId,
      url,
      status: "active",
      created_at: now,
    })
    .run();

  const urlEnvelope = emit(deps.db, {
    projectId: input.projectId,
    payload: {
      type: "deployment.url_confirmed",
      projectId: input.projectId,
      url,
    },
  });
  deps.onEvent?.(urlEnvelope);

  const next = {
    ...payload,
    state: {
      ...payload.state,
      deploymentUrl: url,
      risks: appendCustomGateNote(
        [...payload.state.risks, `Deployment URL confirmed: ${url}`],
        "deployment",
        customText,
      ),
    },
    deployment: { phase: "completed" as const },
  };
  deps.saveSession(input.projectId, next);

  deps.setStatus(input.projectId, "Awaiting Acceptance", "deployment_gate_approved");

  const completedEnvelope = emit(deps.db, {
    projectId: input.projectId,
    payload: {
      type: "deployment.completed",
      projectId: input.projectId,
      url,
    },
  });
  deps.onEvent?.(completedEnvelope);

  if (deps.onDeploymentCompleted) {
    await deps.onDeploymentCompleted(input.projectId);
  }

  return toResult(deps, next);
}

export function getDeploymentStatus(
  deps: DeploymentWorkflowDeps,
  projectId: string,
): DeploymentRunResult {
  const payload = loadDevSession(deps.db, projectId);
  return toResult(deps, payload);
}

function toResult(
  deps: DeploymentWorkflowDeps,
  payload: ReturnType<typeof loadDevSession>,
): DeploymentRunResult {
  const phase = payload.deployment?.phase ?? "idle";
  const exposedUrl =
    phase === "completed" ? payload.state.deploymentUrl : undefined;

  return {
    phase,
    projectStatus: deps.getProjectStatus(payload.state.projectId),
    gateId: payload.deployment?.gateId,
    deploymentUrl: exposedUrl,
  };
}
