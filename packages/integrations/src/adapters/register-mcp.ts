import { loadGatewayMcpConfig } from "./mcp/config.js";
import { createMcpTransportAdapter } from "./mcp/transport.js";
import { registerRealAdapter } from "./resolver.js";

export function registerMcpAdapters(): void {
  const config = loadGatewayMcpConfig();
  for (const [integrationId, spec] of Object.entries(config.servers)) {
    if (spec.transport !== "mcp_stdio" || !spec.command?.length) {
      continue;
    }
    registerRealAdapter(integrationId, createMcpTransportAdapter(integrationId, spec));
  }
}

registerMcpAdapters();
