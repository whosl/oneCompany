import { getGateDefinition } from "./registry.js";
import type { GateMetadata, GateTypeId, ResolveGateInput } from "./types.js";

const SKIP_RISK_OPTION = "skip_risk_and_continue";

const SKIP_FORBIDDEN_GATE_TYPES: GateTypeId[] = [
  "deployment",
  "requirement_confirm",
  "tech_plan_confirm",
  "final_acceptance",
];

export function getAllowedOptions(
  gateType: string,
  metadata: GateMetadata = {},
): readonly string[] {
  const definition = getGateDefinition(gateType);

  if (gateType === "dangerous_operation") {
    if (metadata.riskLevel === "high") {
      return definition.allowedOptions.filter((option) => option !== SKIP_RISK_OPTION);
    }
    return definition.allowedOptions;
  }

  return definition.allowedOptions;
}

export function normalizeDecision(input: ResolveGateInput): string {
  const decision = input.decision.trim();
  if (decision === "custom") {
    const customText = input.customText?.trim();
    if (!customText) {
      throw new Error("customText is required when decision is custom");
    }
    return `custom:${customText}`;
  }
  return decision;
}

export function isAllowedDecision(
  gateType: string,
  decision: string,
  metadata: GateMetadata = {},
): boolean {
  const allowed = getAllowedOptions(gateType, metadata);
  if (allowed.includes(decision)) {
    return true;
  }
  if (decision.startsWith("custom:")) {
    return allowed.includes("custom");
  }
  return false;
}

export function assertAllowedDecision(
  gateType: string,
  decision: string,
  metadata: GateMetadata = {},
): void {
  if (!isAllowedDecision(gateType, decision, metadata)) {
    throw new Error(`Decision not allowed for gate type ${gateType}: ${decision}`);
  }
}

export function gateTypeForbidsSkipRisk(gateType: string): boolean {
  return SKIP_FORBIDDEN_GATE_TYPES.includes(gateType as GateTypeId);
}
