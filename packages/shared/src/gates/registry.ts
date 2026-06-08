import type { GateDefinition, GateTypeId } from "./types.js";

export const GATE_DEFINITIONS: Record<GateTypeId, GateDefinition> = {
  requirement_confirm: {
    id: "requirement_confirm",
    title: "Confirm Requirement",
    descriptionTemplate: "Review the requirement package before development.",
    allowedOptions: ["approve", "revise_then_approve", "reject_and_redo", "custom"],
    allowsCustom: true,
  },
  tech_plan_confirm: {
    id: "tech_plan_confirm",
    title: "Confirm Technical Plan",
    descriptionTemplate: "Review the technical plan before implementation.",
    allowedOptions: ["approve", "revise_then_approve", "reject_and_redo", "custom"],
    allowsCustom: true,
  },
  requirement_stuck: {
    id: "requirement_stuck",
    title: "Requirement Stuck",
    descriptionTemplate: "The requirement loop is stuck or out of budget.",
    allowedOptions: ["keep_answering", "force_continue", "fail"],
    allowsCustom: false,
  },
  slice_failure: {
    id: "slice_failure",
    title: "Slice Failure",
    descriptionTemplate: "A function slice could not be completed within the retry budget.",
    allowedOptions: ["retry", "replan", "request_skip_slice", "fail"],
    allowsCustom: false,
  },
  change_review: {
    id: "change_review",
    title: "Change Review",
    descriptionTemplate: "Review the requested change before continuing.",
    allowedOptions: ["update_plan", "revise_tech_plan", "reject"],
    allowsCustom: false,
  },
  deployment: {
    id: "deployment",
    title: "Deployment Confirmation",
    descriptionTemplate: "Confirm deployment before exposing a URL.",
    allowedOptions: ["approve", "reject", "custom"],
    allowsCustom: true,
  },
  dangerous_operation: {
    id: "dangerous_operation",
    title: "Dangerous Operation",
    descriptionTemplate: "Confirm this operation before it runs.",
    allowedOptions: ["approve", "skip_risk_and_continue", "reject", "custom"],
    allowsCustom: true,
  },
  final_acceptance: {
    id: "final_acceptance",
    title: "Final Acceptance",
    descriptionTemplate: "Accept or reject the final delivery.",
    allowedOptions: ["accept", "reject_and_redo", "custom"],
    allowsCustom: true,
  },
};

export function getGateDefinition(gateType: string): GateDefinition {
  const definition = GATE_DEFINITIONS[gateType as GateTypeId];
  if (!definition) {
    throw new Error(`Unknown gate type: ${gateType}`);
  }
  return definition;
}
