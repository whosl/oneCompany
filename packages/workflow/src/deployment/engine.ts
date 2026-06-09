import { randomUUID } from "node:crypto";
import { deployments, emit } from "@oc/shared";
import { loadDevSession, saveDevSession } from "../development/state.js";
import type { DeploymentRunResult, DeploymentWorkflowDeps } from "./types.js";

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

  const next = {
    ...payload,
    deployment: {
      phase: "awaiting_gate" as const,
      gateId: gate.id,
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

export function handleDeploymentGateDecision(
  deps: DeploymentWorkflowDeps,
  input: { projectId: string; decision: string },
): DeploymentRunResult {
  const payload = deps.loadSession(input.projectId);
  if (payload.deployment?.phase !== "awaiting_gate") {
    throw new Error("No deployment gate awaiting decision");
  }

  if (input.decision === "reject") {
    const next = {
      ...payload,
      deployment: { phase: "idle" as const },
    };
    deps.saveSession(input.projectId, next);
    return toResult(deps, next);
  }

  if (input.decision !== "approve" && input.decision !== "custom") {
    throw new Error(`Unsupported deployment decision: ${input.decision}`);
  }

  const url = payload.deployment.pendingUrl;
  if (!url) {
    throw new Error("Deployment URL must be submitted before approval");
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
      risks: [...payload.state.risks, `Deployment URL confirmed: ${url}`],
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
    void Promise.resolve(deps.onDeploymentCompleted(input.projectId));
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
