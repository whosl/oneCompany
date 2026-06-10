import { emit, type Db, type EventEnvelope } from "@oc/shared";
import { enableIntegrationForProject } from "./connection.js";
import { getIntegrationById } from "./registry.js";
import { normalizeRequirementIntegrationIds } from "./integration-id-normalize.js";

const GATEWAY_AGENT_ID = "integration.gateway";

export type AutoEnableIntegrationsResult = {
  normalized: string[];
  enabled: string[];
  unknown: string[];
  warnings: string[];
};

function emitIntegrationWarning(
  db: Db,
  projectId: string,
  message: string,
  onEvent?: (envelope: EventEnvelope) => void,
): void {
  const envelope = emit(db, {
    projectId,
    agentId: GATEWAY_AGENT_ID,
    payload: {
      type: "agent.observe",
      projectId,
      agentId: GATEWAY_AGENT_ID,
      summary: message,
    },
  });
  onEvent?.(envelope);
}

export async function autoEnableIntegrationsFromRequirement(
  db: Db,
  input: {
    projectId: string;
    requirementIntegrations: string[];
    onEvent?: (envelope: EventEnvelope) => void;
  },
): Promise<AutoEnableIntegrationsResult> {
  const { normalized, unknown, results } = normalizeRequirementIntegrationIds(
    input.requirementIntegrations,
  );
  const warnings: string[] = [];
  const enabled: string[] = [];

  for (const result of results) {
    if (result.status === "alias" && result.integrationId) {
      const message = `Normalized requirement integration "${result.raw}" → ${result.integrationId}`;
      warnings.push(message);
      emitIntegrationWarning(db, input.projectId, message, input.onEvent);
    }
  }

  for (const raw of unknown) {
    const message = `Unknown requirement integration "${raw}" — not in gateway registry`;
    warnings.push(message);
    emitIntegrationWarning(db, input.projectId, message, input.onEvent);
  }

  for (const integrationId of normalized) {
    const definition = getIntegrationById(integrationId);
    await enableIntegrationForProject(db, {
      projectId: input.projectId,
      integrationId,
      scopes: [...definition.permissions],
    });
    enabled.push(integrationId);
  }

  return { normalized, enabled, unknown, warnings };
}
