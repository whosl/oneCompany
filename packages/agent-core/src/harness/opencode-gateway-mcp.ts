import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveOcGatewayMcpEntry(): string {
  const fromEnv = process.env.OC_GATEWAY_MCP_ENTRY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  return path.join(packagesRoot, "oc-gateway-mcp/dist/index.js");
}

export function buildOcGatewayMcpConfig(projectId: string): Record<string, unknown> | undefined {
  if (process.env.OC_INTEGRATION_GATEWAY_MCP === "0") {
    return undefined;
  }
  const apiUrl = process.env.API_URL ?? process.env.OC_API_URL ?? "http://127.0.0.1:3001";
  return {
    "oc-gateway": {
      type: "local",
      command: ["node", resolveOcGatewayMcpEntry()],
      environment: {
        OC_PROJECT_ID: projectId,
        OC_API_URL: apiUrl.replace(/\/$/, ""),
      },
      enabled: true,
      timeout: 30_000,
    },
  };
}
