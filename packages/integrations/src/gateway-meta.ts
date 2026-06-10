import {
  getIntegrationAdapterMode,
  getIntegrationGateMode,
  type IntegrationGatewayMeta,
} from "./adapters/config.js";
import { resolveSkillPacksRoot } from "./skill-pack-loader.js";

export function getIntegrationGatewayMeta(skillPacksRoot?: string): IntegrationGatewayMeta {
  return {
    adapterMode: getIntegrationAdapterMode(),
    gateMode: getIntegrationGateMode(),
    skillPacksRoot: resolveSkillPacksRoot(skillPacksRoot),
  };
}
