import type { IntegrationDefinition } from "@oc/shared";
import type { ConnectorAdapter } from "../connectors/types.js";
import { getIntegrationAdapterMode } from "./config.js";
import { MOCK_CONNECTOR_ADAPTERS } from "./mock-adapter.js";

const REAL_ADAPTERS = new Map<string, ConnectorAdapter>();

export function registerRealAdapter(integrationId: string, adapter: ConnectorAdapter): void {
  REAL_ADAPTERS.set(integrationId, adapter);
}

export function clearRealAdaptersForTests(): void {
  REAL_ADAPTERS.clear();
}

export function resolveAdapter(definition: IntegrationDefinition): ConnectorAdapter {
  const mode = getIntegrationAdapterMode();

  if (mode === "mock") {
    const mock = MOCK_CONNECTOR_ADAPTERS[definition.id];
    if (!mock) {
      throw new Error(`No mock adapter registered for ${definition.id}`);
    }
    return mock;
  }

  const real = REAL_ADAPTERS.get(definition.id);
  if (real) {
    return real;
  }

  throw new Error(
    `No real adapter registered for ${definition.id}; set OC_INTEGRATION_ADAPTER_MODE=mock or add a native/MCP adapter`,
  );
}
