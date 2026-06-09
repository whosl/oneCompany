import type { Db, IntegrationStatusSnapshot } from "@oc/shared";
import { listIntegrations } from "./registry.js";
import { getConnectionForProject } from "./connection.js";
import { resolveConnectionStatus } from "./offline.js";

function isSecretConfigured(ref: string): boolean {
  return Boolean(process.env[ref]?.trim());
}

export function buildIntegrationStatusForProject(
  db: Db,
  projectId: string,
): IntegrationStatusSnapshot[] {
  return listIntegrations().map((definition) => {
    const connection = getConnectionForProject(db, projectId, definition.id);
    const configuredStatus = connection?.status ?? "not_configured";
    return {
      integrationId: definition.id,
      displayName: definition.displayName,
      version: definition.version,
      status: resolveConnectionStatus(definition, configuredStatus),
      secretReadiness: definition.secretRefs.map((ref) => ({
        ref,
        configured: isSecretConfigured(ref),
      })),
      offlineFallbackSkillPackId: definition.offlineFallbackSkillPackId,
      scopes: connection?.scopes ?? [],
    };
  });
}
