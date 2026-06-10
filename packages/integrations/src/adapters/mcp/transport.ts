import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ConnectorAdapter } from "../../connectors/types.js";
import {
  type GatewayMcpServerSpec,
  resolveGatewayCommand,
  resolveGatewaySpawnEnv,
  resolveTemplateString,
} from "./config.js";
import { resolveMcpToolCall } from "./tool-mapping.js";

type CachedClient = {
  client: Client;
  transport: StdioClientTransport;
};

const CLIENT_CACHE = new Map<string, CachedClient>();

function cacheKey(integrationId: string): string {
  return integrationId;
}

async function getMcpClient(
  integrationId: string,
  spec: GatewayMcpServerSpec,
): Promise<Client> {
  const key = cacheKey(integrationId);
  const existing = CLIENT_CACHE.get(key);
  if (existing) {
    return existing.client;
  }

  const command = resolveGatewayCommand(spec.command);
  const [executable, ...args] = command;
  const env = {
    ...resolveGatewaySpawnEnv(spec.envFromSecretRefs),
  };
  const cwd = spec.cwd ? resolveTemplateString(spec.cwd) : undefined;

  const transport = new StdioClientTransport({
    command: executable!,
    args,
    env,
    cwd,
    stderr: "pipe",
  });
  const client = new Client({ name: "onecompany-gateway", version: "1.0.0" });
  await client.connect(transport);
  CLIENT_CACHE.set(key, { client, transport });
  return client;
}

export async function closeMcpClientsForTests(): Promise<void> {
  for (const entry of CLIENT_CACHE.values()) {
    await entry.transport.close();
  }
  CLIENT_CACHE.clear();
}

function formatToolResult(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const textParts =
    result.content
      ?.filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .filter(Boolean) ?? [];
  if (textParts.length === 1) {
    try {
      return JSON.parse(textParts[0]!);
    } catch {
      return { text: textParts[0], untrusted: true };
    }
  }
  return {
    content: result.content,
    isError: result.isError,
    untrusted: true,
  };
}

export function createMcpTransportAdapter(
  integrationId: string,
  spec: GatewayMcpServerSpec,
): ConnectorAdapter {
  return {
    integrationId,
    async callTool(toolName, context) {
      const client = await getMcpClient(integrationId, spec);
      const { mcpTool, mcpArgs } = resolveMcpToolCall(integrationId, toolName, context.args);
      const result = await client.callTool({
        name: mcpTool,
        arguments: mcpArgs,
      });
      return formatToolResult(result);
    },
  };
}
