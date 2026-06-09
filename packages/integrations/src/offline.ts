import type { IntegrationConnectionStatus, IntegrationDefinition } from "@oc/shared";

export function isOfflineModeEnabled(): boolean {
  return process.env.OC_OFFLINE_MODE === "1";
}

export function resolveConnectionStatus(
  definition: IntegrationDefinition,
  configuredStatus: IntegrationConnectionStatus | "not_configured",
): IntegrationConnectionStatus {
  if (configuredStatus === "not_configured") {
    return "not_configured";
  }
  if (isOfflineModeEnabled() && definition.offlineFallbackSkillPackId) {
    return "offline_fallback";
  }
  return configuredStatus;
}

export function shouldUseOfflineFallback(
  definition: IntegrationDefinition,
  connectionStatus: IntegrationConnectionStatus,
): boolean {
  if (!definition.offlineFallbackSkillPackId) {
    return false;
  }
  if (isOfflineModeEnabled()) {
    return true;
  }
  return connectionStatus === "offline_fallback";
}
