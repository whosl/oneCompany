/** Local mirror of gate presentation fields — do not import @oc/shared (pulls better-sqlite3). */

const GATE_PRESENTATIONS: Record<
  string,
  { title: string; description: string; allowsCustom: boolean }
> = {
  requirement_confirm: {
    title: "Confirm Requirement",
    description: "Review the requirement package before development.",
    allowsCustom: true,
  },
  tech_plan_confirm: {
    title: "Confirm Technical Plan",
    description: "Review the technical plan before implementation.",
    allowsCustom: true,
  },
  requirement_stuck: {
    title: "Requirement Stuck",
    description: "The requirement loop is stuck or out of budget.",
    allowsCustom: false,
  },
  slice_failure: {
    title: "Slice Failure",
    description: "A function slice could not be completed within the retry budget.",
    allowsCustom: false,
  },
  change_review: {
    title: "Change Review",
    description: "Review the requested change before continuing.",
    allowsCustom: false,
  },
  deployment: {
    title: "Deployment Confirmation",
    description: "Confirm deployment before exposing a URL.",
    allowsCustom: true,
  },
  dangerous_operation: {
    title: "Dangerous Operation",
    description: "Confirm this operation before it runs.",
    allowsCustom: true,
  },
  final_acceptance: {
    title: "Final Acceptance",
    description: "Accept or reject the final delivery.",
    allowsCustom: true,
  },
};

export type IntegrationGateMetadata = {
  integrationId?: string;
  toolName?: string;
  caller?: string;
};

export function formatIntegrationToolLabel(metadata?: IntegrationGateMetadata): string | undefined {
  if (!metadata?.integrationId || !metadata.toolName) {
    return undefined;
  }
  return `${metadata.integrationId}:${metadata.toolName}`;
}

export function formatIntegrationGateReason(metadata?: IntegrationGateMetadata): string | undefined {
  const label = formatIntegrationToolLabel(metadata);
  if (!label) {
    return undefined;
  }
  return `Approve ${label} to continue.`;
}

export function formatIntegrationGateSummary(metadata?: IntegrationGateMetadata): string {
  const label = formatIntegrationToolLabel(metadata);
  if (!label) {
    return "Awaiting decision";
  }
  return `Awaiting approval for ${label}`;
}

export function getGatePresentation(gateType: string) {
  const presentation = GATE_PRESENTATIONS[gateType];
  if (!presentation) {
    return {
      title: gateType,
      description: "Human confirmation required.",
      allowsCustom: false,
    };
  }
  return presentation;
}
