import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type GatewayMcpServerSpec = {
  transport: string;
  command?: string[];
  cwd?: string;
  envFromSecretRefs?: Record<string, string>;
  notes?: string;
};

export type GatewayMcpConfig = {
  version: string;
  servers: Record<string, GatewayMcpServerSpec>;
};

function findGatewayConfigPath(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(current, "config", "oc-gateway-mcp.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function defaultConfigPath(): string {
  if (process.env.OC_GATEWAY_MCP_CONFIG?.trim()) {
    return process.env.OC_GATEWAY_MCP_CONFIG.trim();
  }
  const fromModule = findGatewayConfigPath(path.dirname(fileURLToPath(import.meta.url)));
  if (fromModule) {
    return fromModule;
  }
  const fromCwd = findGatewayConfigPath(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }
  throw new Error("oc-gateway-mcp config not found; set OC_GATEWAY_MCP_CONFIG");
}

export function loadGatewayMcpConfig(configPath = defaultConfigPath()): GatewayMcpConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw) as GatewayMcpConfig;
}

export function resolveTemplateString(
  value: string,
  extraEnv: Record<string, string> = {},
): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
    return extraEnv[key] ?? process.env[key] ?? "";
  });
}

export function resolveGatewayCommand(
  command: string[] | undefined,
  extraEnv: Record<string, string> = {},
): string[] {
  if (!command || command.length === 0) {
    throw new Error("MCP server command is required");
  }
  return command.map((part) => resolveTemplateString(part, extraEnv));
}

export function resolveGatewaySpawnEnv(
  envFromSecretRefs: Record<string, string> | undefined,
): Record<string, string> {
  if (!envFromSecretRefs) {
    return {};
  }
  const env: Record<string, string> = {};
  for (const [target, source] of Object.entries(envFromSecretRefs)) {
    const value = process.env[source]?.trim();
    if (value) {
      env[target] = value;
    }
  }
  return env;
}
