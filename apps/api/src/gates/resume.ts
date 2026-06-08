import type { GateRecord } from "./service.js";
import type { RequirementService } from "../requirement/service.js";

export function createGateResumeHandler(requirement?: RequirementService) {
  return async (gate: GateRecord, decision: string): Promise<void> => {
    if (gate.gateType !== "requirement_stuck" || !requirement) {
      return;
    }

    try {
      await requirement.resumeAfterGate(gate.projectId, decision);
    } catch (error) {
      if (error instanceof Error) {
        const benign =
          error.message.includes("Expected awaiting_gate") ||
          error.message.includes("Requirement session not found");
        if (benign) {
          return;
        }
      }
      throw error;
    }
  };
}
