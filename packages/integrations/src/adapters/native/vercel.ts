import type { ConnectorAdapter } from "../../connectors/types.js";

const VERCEL_API_BASE = "https://api.vercel.com";

function parseArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {};
  }
  return args as Record<string, unknown>;
}

function requireToken(): string {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    throw new Error("VERCEL_TOKEN is required for Vercel integration");
  }
  return token;
}

async function vercelRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${VERCEL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Vercel API ${response.status}: ${body}`);
  }
  return body ? (JSON.parse(body) as T) : ({} as T);
}

export function createVercelNativeAdapter(): ConnectorAdapter {
  return {
    integrationId: "vercel",
    async callTool(toolName, context) {
      const args = parseArgs(context.args);

      switch (toolName) {
        case "list_projects": {
          const limit = typeof args.limit === "number" ? args.limit : 20;
          const teamId = typeof args.teamId === "string" ? args.teamId : undefined;
          const query = new URLSearchParams({ limit: String(limit) });
          if (teamId) {
            query.set("teamId", teamId);
          }
          const payload = await vercelRequest<{ projects?: Array<{ id: string; name: string }> }>(
            `/v9/projects?${query.toString()}`,
          );
          return {
            projects: (payload.projects ?? []).map((project) => ({
              id: project.id,
              name: project.name,
            })),
            untrusted: true,
          };
        }
        case "create_preview_deploy": {
          const projectId = args.projectId ?? args.project_id;
          const name = args.name;
          if (typeof projectId !== "string" || !projectId.trim()) {
            throw new Error("create_preview_deploy requires projectId");
          }
          if (typeof name !== "string" || !name.trim()) {
            throw new Error("create_preview_deploy requires name");
          }
          const payload = await vercelRequest<{
            id?: string;
            url?: string;
            alias?: string[];
          }>("/v13/deployments", {
            method: "POST",
            body: JSON.stringify({
              name,
              project: projectId,
              target: "preview",
              gitSource: args.gitSource,
              env: args.env,
            }),
          });
          const url = payload.url ?? payload.alias?.[0];
          return {
            deploymentId: payload.id,
            url,
            untrusted: true,
          };
        }
        case "read_logs": {
          const deploymentId = args.deploymentId ?? args.deployment_id;
          if (typeof deploymentId !== "string" || !deploymentId.trim()) {
            throw new Error("read_logs requires deploymentId");
          }
          const payload = await vercelRequest<{ events?: Array<{ text?: string; payload?: unknown }> }>(
            `/v2/deployments/${encodeURIComponent(deploymentId)}/events`,
          );
          const lines =
            payload.events
              ?.map((event) =>
                typeof event.text === "string"
                  ? event.text
                  : event.payload
                    ? JSON.stringify(event.payload)
                    : "",
              )
              .filter(Boolean) ?? [];
          return { lines, untrusted: true };
        }
        default:
          throw new Error(`Unsupported Vercel tool: ${toolName}`);
      }
    },
  };
}
