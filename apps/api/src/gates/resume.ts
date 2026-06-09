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
      try {
        await services.requirement.resumeAfterGate(gate.projectId, decision);
      } catch (error) {
        if (isBenignResumeError(error, "Requirement session not found")) {
          return;
        }
        throw error;
      }
      return;
    }

    if (gate.gateType === "deployment" && services.deployment) {
      try {
        await services.deployment.resumeAfterGate(gate.projectId, decision);
      } catch (error) {
        if (isBenignResumeError(error, "Deployment session not found")) {
          return;
        }
        throw error;
      }
      return;
    }

    if (gate.gateType === "final_acceptance" && services.delivery) {
      try {
        services.delivery.resumeFinalAcceptance(gate.projectId, decision);
      } catch (error) {
        if (isBenignResumeError(error, "Delivery session not found")) {
          return;
        }
        throw error;
      }
      return;
    }

    if (DEVELOPMENT_GATE_TYPES.has(gate.gateType) && services.development) {
      try {
        await services.development.resumeAfterGate(gate.projectId, decision);
      } catch (error) {
        if (isBenignResumeError(error, "Development session not found")) {
          return;
        }
        throw error;
      }
    }
  };
}

function isBenignResumeError(error: unknown, notFoundMessage: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes("Expected awaiting_gate") ||
    error.message.includes("Expected awaiting_gate or change_review") ||
    error.message.includes(notFoundMessage)
  );
}
