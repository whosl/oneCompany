import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type IntegrationDefinitionRow = {
  id: string;
  displayName: string;
  toolAllowlist: string[];
};

type ProjectIntegrationRow = {
  integrationId: string;
  status: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`oc-gateway-mcp requires ${name}`);
  }
  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gateway fetch failed ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

export async function listGatewayTools(
  apiUrl: string,
  projectId: string,
): Promise<Array<{ integrationId: string; toolName: string; description: string }>> {
  const [definitionsBody, projectBody] = await Promise.all([
    fetchJson<{ integrations: IntegrationDefinitionRow[] }>(`${apiUrl}/integrations`),
    fetchJson<{ integrations: ProjectIntegrationRow[] }>(
      `${apiUrl}/projects/${projectId}/integrations`,
    ),
  ]);

  const enabled = new Set(
    projectBody.integrations
      .filter((row) => row.status !== "disabled" && row.status !== "not_configured")
      .map((row) => row.integrationId),
  );

  const tools: Array<{ integrationId: string; toolName: string; description: string }> = [];
  for (const definition of definitionsBody.integrations) {
    if (!enabled.has(definition.id)) {
      continue;
    }
    for (const toolName of definition.toolAllowlist) {
      tools.push({
        integrationId: definition.id,
        toolName,
        description: `${definition.displayName} — ${toolName}`,
      });
    }
  }
  return tools;
}

export function formatGatewayToolName(integrationId: string, toolName: string): string {
  return `oc_${integrationId}__${toolName}`;
}

async function callGatewayTool(
  apiUrl: string,
  projectId: string,
  prefixedToolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${apiUrl}/projects/${projectId}/integrations/opencode/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toolName: prefixedToolName, args }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway call failed (${response.status}): ${text}`);
  }
  return response.json();
}

export async function startOcGatewayMcpServer(): Promise<void> {
  const apiUrl = requiredEnv("OC_API_URL").replace(/\/$/, "");
  const projectId = requiredEnv("OC_PROJECT_ID");
  const tools = await listGatewayTools(apiUrl, projectId);

  const server = new McpServer(
    { name: "oc-gateway-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  for (const tool of tools) {
    const prefixed = formatGatewayToolName(tool.integrationId, tool.toolName);
    server.registerTool(
      prefixed,
      {
        description: tool.description,
        inputSchema: z.object({}).passthrough(),
      },
      async (args) => {
        const result = await callGatewayTool(
          apiUrl,
          projectId,
          prefixed,
          (args ?? {}) as Record<string, unknown>,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entryPath) {
  startOcGatewayMcpServer().catch((error) => {
    console.error("[oc-gateway-mcp] fatal:", error);
    process.exit(1);
  });
}
