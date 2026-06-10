import type { IntegrationDefinition } from "@oc/shared";
import { getIntegrationAdapterMode } from "./config.js";

export function isSecretConfigured(ref: string): boolean {
  return Boolean(process.env[ref]?.trim());
}

export function getMissingSecretRefs(definition: IntegrationDefinition): string[] {
  return definition.secretRefs.filter((ref) => !isSecretConfigured(ref));
}

/** In real adapter mode, missing secrets should not attempt a live remote call. */
export function shouldFallbackForMissingSecrets(definition: IntegrationDefinition): boolean {
  if (getIntegrationAdapterMode() !== "real") {
    return false;
  }
  if (definition.secretRefs.length === 0) {
    return false;
  }
  return getMissingSecretRefs(definition).length > 0;
}
