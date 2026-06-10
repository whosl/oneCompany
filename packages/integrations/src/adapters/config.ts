export type IntegrationAdapterMode = "mock" | "real";

export type IntegrationGateMode = "sync" | "async";

export function getIntegrationAdapterMode(): IntegrationAdapterMode {
  const mode = process.env.OC_INTEGRATION_ADAPTER_MODE?.trim().toLowerCase();
  if (mode === "real") {
    return "real";
  }
  return "mock";
}

export function getIntegrationGateMode(): IntegrationGateMode {
  const mode = process.env.OC_INTEGRATION_GATE_MODE?.trim().toLowerCase();
  if (mode === "async") {
    return "async";
  }
  return "sync";
}

export type IntegrationGatewayMeta = {
  adapterMode: IntegrationAdapterMode;
  gateMode: IntegrationGateMode;
  skillPacksRoot: string;
};
