export const GATE_TYPES = [
  "requirement_confirm",
  "tech_plan_confirm",
  "requirement_stuck",
  "slice_failure",
  "change_review",
  "deployment",
  "dangerous_operation",
  "final_acceptance",
] as const;

export type GateTypeId = (typeof GATE_TYPES)[number];

export type GateRiskLevel = "low" | "medium" | "high";

export type GateMetadata = {
  riskLevel?: GateRiskLevel;
};

export type GateDefinition = {
  id: GateTypeId;
  title: string;
  descriptionTemplate: string;
  allowedOptions: readonly string[];
  allowsCustom: boolean;
};

export type StoredHumanGatePayload = {
  version: 1;
  options: string[];
  metadata?: GateMetadata;
};

export type ResolveGateInput = {
  decision: string;
  customText?: string;
};
