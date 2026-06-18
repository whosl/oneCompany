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
  if (decision === "reject_and_redo") {
    const feedback = input.customText?.trim();
    if (feedback) {
      return `reject_and_redo:${feedback}`;
    }
  }
  if (decision === "reject") {
    const feedback = input.customText?.trim();
    if (feedback) {
      return `reject:${feedback}`;
    }
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
  if (decision.startsWith("reject_and_redo:")) {
    return allowed.includes("reject_and_redo");
  }
  if (decision.startsWith("reject:")) {
    return allowed.includes("reject");
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

export type ParsedDecision = {
  raw: string;
  kind: string;
  customText?: string;
  isCustom: boolean;
};

export function parseDecision(decision: string): ParsedDecision {
  if (decision.startsWith("custom:")) {
    const customText = decision.slice("custom:".length);
    return { raw: decision, kind: "custom", customText, isCustom: true };
  }
  if (decision.startsWith("reject_and_redo:")) {
    const customText = decision.slice("reject_and_redo:".length);
    return { raw: decision, kind: "reject_and_redo", customText, isCustom: false };
  }
  if (decision.startsWith("reject:")) {
    const customText = decision.slice("reject:".length);
    return { raw: decision, kind: "reject", customText, isCustom: false };
  }
  return { raw: decision, kind: decision, isCustom: false };
}

/** Maps custom:* decisions to the approve-like option for a gate type. */
export function resolveGateDecision(
  gateType: string,
  decision: string,
): { effective: string; customText?: string } {
  const parsed = parseDecision(decision);
  if (!parsed.isCustom) {
    return { effective: parsed.kind, customText: parsed.customText };
  }

  switch (gateType) {
    case "requirement_confirm":
    case "tech_plan_confirm":
    case "deployment":
    case "dangerous_operation":
      return { effective: "approve", customText: parsed.customText };
    case "final_acceptance":
      return { effective: "reject_and_redo", customText: parsed.customText };
    default:
      throw new Error(`Custom decision not supported for gate type: ${gateType}`);
  }
}

export function appendCustomGateNote(
  notes: string[],
  gateType: string,
  customText?: string,
): string[] {
  if (!customText?.trim()) {
    return notes;
  }
  return [...notes, `Human gate note (${gateType}): ${customText.trim()}`];
}

/** Single source of truth for whether a gate decision permits execution to proceed. */
export function isApprovalDecision(
  gateType: string,
  metadata: GateMetadata = {},
  decision: string,
): boolean {
  const { effective } = resolveGateDecision(gateType, decision);

  if (effective === "approve") {
    return true;
  }

  if (effective !== "skip_risk_and_continue") {
    return false;
  }

  if (gateTypeForbidsSkipRisk(gateType)) {
    return false;
  }

  if (gateType === "dangerous_operation" && metadata.riskLevel === "high") {
    return false;
  }

  return true;
}
