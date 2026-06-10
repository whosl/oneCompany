import { autoEnableIntegrationsFromRequirement } from "@oc/integrations";
import type { Db, EventEnvelope } from "@oc/shared";

export async function applyRequirementIntegrations(
  deps: {
    db: Db;
    projectId: string;
    onEvent?: (envelope: EventEnvelope) => void;
  },
  requirementIntegrations: string[],
): Promise<{
  normalizedIntegrations: string[];
  warnings: string[];
}> {
  if (requirementIntegrations.length === 0) {
    return { normalizedIntegrations: [], warnings: [] };
  }

  const result = await autoEnableIntegrationsFromRequirement(deps.db, {
    projectId: deps.projectId,
    requirementIntegrations,
    onEvent: deps.onEvent,
  });

  return {
    normalizedIntegrations: result.normalized,
    warnings: result.warnings,
  };
}
