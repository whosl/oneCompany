import {
  appendCustomGateNote,
  resolveGateDecision,
  type Db,
  type EventEnvelope,
  type ProjectStatus,
} from "@oc/shared";
import type { DevelopmentSessionPayload } from "../development/types.js";
import type { DeliveryReportDeps, GenerateDeliveryReportInput } from "./report-generator.js";
import { generateDeliveryReport } from "./report-generator.js";
import { ensureDeliveryDockerArtifacts } from "./docker-artifacts.js";

export type FinalAcceptanceDeps = DeliveryReportDeps & {
  createGate: (projectId: string, gateType: "final_acceptance") => { id: string };
  setStatus: (projectId: string, status: ProjectStatus, trigger: string) => void;
  getProjectStatus: (projectId: string) => ProjectStatus;
  loadSession: (projectId: string) => DevelopmentSessionPayload;
  saveSession: (projectId: string, payload: DevelopmentSessionPayload) => void;
};

export type FinalAcceptanceResult = {
  phase: "idle" | "awaiting_final_acceptance" | "completed";
  projectStatus: ProjectStatus;
  gateId?: string;
};

export function enterAwaitingAcceptance(
  deps: FinalAcceptanceDeps,
  input: GenerateDeliveryReportInput,
): FinalAcceptanceResult {
  const status = deps.getProjectStatus(input.projectId);
  if (status !== "Awaiting Acceptance") {
    throw new Error(`Expected Awaiting Acceptance, got ${status}`);
  }

  const payload = deps.loadSession(input.projectId);
  if (!payload.delivery?.reportGenerated) {
    ensureDeliveryDockerArtifacts(deps, {
      projectId: input.projectId,
      repoPath: input.repoPath,
    });
    generateDeliveryReport(deps, {
      ...input,
      projectStatus: status,
      stateRisks: input.stateRisks ?? payload.state.risks,
      taskTitles: input.taskTitles ?? payload.state.taskQueue.map((task) => task.title),
    });
  }

  if (payload.delivery?.phase === "awaiting_final_acceptance" && payload.delivery.gateId) {
    return toResult(deps, {
      ...payload,
      delivery: { ...payload.delivery, reportGenerated: true },
    });
  }

  const gate = deps.createGate(input.projectId, "final_acceptance");
  const next: DevelopmentSessionPayload = {
    ...payload,
    delivery: {
      phase: "awaiting_final_acceptance",
      gateId: gate.id,
      reportGenerated: true,
    },
  };
  deps.saveSession(input.projectId, next);
  return toResult(deps, next);
}

export function handleFinalAcceptanceDecision(
  deps: FinalAcceptanceDeps,
  input: { projectId: string; decision: string },
): FinalAcceptanceResult {
  const payload = deps.loadSession(input.projectId);
  if (payload.delivery?.phase !== "awaiting_final_acceptance") {
    throw new Error("No final acceptance gate awaiting decision");
  }

  const { effective, customText } = resolveGateDecision("final_acceptance", input.decision);

  if (effective === "accept") {
    deps.setStatus(input.projectId, "Delivered", "final_acceptance_accepted");
    const next: DevelopmentSessionPayload = {
      ...payload,
      state: {
        ...payload.state,
        risks: appendCustomGateNote(payload.state.risks, "final_acceptance", customText),
      },
      delivery: { phase: "completed", reportGenerated: true },
    };
    deps.saveSession(input.projectId, next);
    return toResult(deps, next);
  }

  if (effective === "reject_and_redo") {
    deps.setStatus(input.projectId, "Developing", "final_acceptance_rejected");
    const next: DevelopmentSessionPayload = {
      ...payload,
      delivery: { phase: "idle", reportGenerated: false },
      meta: { ...payload.meta, phase: "slicing" },
    };
    deps.saveSession(input.projectId, next);
    return toResult(deps, next);
  }

  throw new Error(`Unsupported final acceptance decision: ${input.decision}`);
}

export function getFinalAcceptanceStatus(
  deps: FinalAcceptanceDeps,
  projectId: string,
): FinalAcceptanceResult {
  const payload = deps.loadSession(projectId);
  return toResult(deps, payload);
}

function toResult(
  deps: FinalAcceptanceDeps,
  payload: DevelopmentSessionPayload,
): FinalAcceptanceResult {
  return {
    phase: payload.delivery?.phase ?? "idle",
    projectStatus: deps.getProjectStatus(payload.state.projectId),
    gateId: payload.delivery?.gateId,
  };
}
