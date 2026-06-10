import { GateResumeConflictError } from "@oc/shared";
import type { GateRecord } from "./service.js";
import type { DevelopmentService } from "../development/service.js";
import type { RequirementService } from "../requirement/service.js";
import type { DeploymentService } from "../deployment/service.js";
import type { DeliveryService } from "../delivery/service.js";

const DEVELOPMENT_GATE_TYPES = new Set([
  "tech_plan_confirm",
  "slice_failure",
  "change_review",
]);

function isStaleGateError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes("Expected awaiting_gate") ||
    error.message.includes("Expected awaiting_gate or change_review") ||
    error.message.includes("session not found") ||
    error.message.includes("Requirement session not found") ||
    error.message.includes("Development session not found") ||
    error.message.includes("Deployment session not found") ||
    error.message.includes("Delivery session not found") ||
    error.message.includes("No deployment gate awaiting decision") ||
    error.message.includes("No final acceptance gate awaiting decision") ||
    error.message.includes("Change review session missing")
  );
}

async function invokeResume(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof GateResumeConflictError) {
      throw error;
    }
    if (isStaleGateError(error)) {
      throw new GateResumeConflictError("stale_gate", error.message);
    }
    throw error;
  }
}

export function createGateResumeHandler(services: {
  requirement?: RequirementService;
  development?: DevelopmentService;
  deployment?: DeploymentService;
  delivery?: DeliveryService;
}) {
  return async (gate: GateRecord, decision: string): Promise<void> => {
    if (
      (gate.gateType === "requirement_stuck" || gate.gateType === "requirement_confirm") &&
      services.requirement
    ) {
      await invokeResume(() => services.requirement!.resumeAfterGate(gate.projectId, decision));
      return;
    }

    if (gate.gateType === "deployment" && services.deployment) {
      await invokeResume(() => services.deployment!.resumeAfterGate(gate.projectId, decision));
      return;
    }

    if (gate.gateType === "final_acceptance" && services.delivery) {
      await invokeResume(() => {
        services.delivery!.resumeFinalAcceptance(gate.projectId, decision);
      });
      return;
    }

    if (DEVELOPMENT_GATE_TYPES.has(gate.gateType) && services.development) {
      await invokeResume(() => services.development!.resumeAfterGate(gate.projectId, decision));
    }
  };
}
