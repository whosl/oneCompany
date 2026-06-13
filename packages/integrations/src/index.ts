import "./adapters/register-native.js";
import "./adapters/register-mcp.js";

export { P1_INTEGRATION_DEFINITIONS } from "./p1-definitions.js";
export {
  registerIntegration,
  getIntegration,
  getIntegrationById,
  listIntegrations,
  assertToolAllowed,
  seedDefaultIntegrations,
  resetIntegrationRegistryForTests,
} from "./registry.js";
export {
  enableIntegrationForProject,
  getConnectionForProject,
  listConnectionsForProject,
} from "./connection.js";
export { isOfflineModeEnabled, shouldUseOfflineFallback } from "./offline.js";
export {
  loadSkillPack,
  listInstalledSkillPacks,
  resolveSkillPacksRoot,
} from "./skill-pack-loader.js";
export {
  callIntegrationTool,
  type CallIntegrationToolDeps,
  type CallIntegrationToolInput,
  type CallIntegrationToolResult,
  type IntegrationCaller,
} from "./call-tool.js";
export {
  getIntegrationAdapterMode,
  getIntegrationGateMode,
  type IntegrationAdapterMode,
  type IntegrationGateMode,
  type IntegrationGatewayMeta,
} from "./adapters/config.js";
export { resolveAdapter, registerRealAdapter, clearRealAdaptersForTests } from "./adapters/resolver.js";
export {
  formatGatewayToolName,
  parseGatewayToolName,
} from "./adapters/mcp/gateway-tool-name.js";
export { loadGatewayMcpConfig, type GatewayMcpConfig } from "./adapters/mcp/config.js";
export {
  getMissingSecretRefs,
  shouldFallbackForMissingSecrets,
  isSecretConfigured,
} from "./adapters/readiness.js";
export { MOCK_CONNECTOR_ADAPTERS } from "./adapters/mock-adapter.js";
export { MINIMAL_PNG, writeMockPng } from "./adapters/mock-artifact.js";
export {
  isIntegrationAuthorizePending,
  isIntegrationAuthorizeAllowed,
  type IntegrationAuthorizeResult,
} from "./gate-protocol.js";
export { getIntegrationGatewayMeta } from "./gateway-meta.js";
export { buildIntegrationStatusForProject } from "./status.js";
export {
  normalizeIntegrationId,
  normalizeRequirementIntegrationIds,
  type NormalizeIntegrationIdResult,
} from "./integration-id-normalize.js";
export {
  autoEnableIntegrationsFromRequirement,
  type AutoEnableIntegrationsResult,
} from "./auto-enable-from-requirement.js";
export { assertUntrustedResourceDoesNotOverridePolicy, wrapUntrustedResource } from "./untrusted.js";
export {
  listProjectMcpConfigs,
  getProjectMcpConfig,
  upsertProjectMcpConfig,
  deleteProjectMcpConfig,
  presetDefaultMcpConfigs,
  projectMcpConfigsToOpencode,
} from "./project-mcp.js";
export { PRESET_MCP_SERVERS, resolvePresetMcpServers } from "./preset-mcp.js";
