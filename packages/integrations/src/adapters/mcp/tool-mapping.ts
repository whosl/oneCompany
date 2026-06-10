export type McpToolMapping = {
  mcpTool: string;
  mapArgs?: (args: unknown) => Record<string, unknown>;
};

/**
 * Maps OneCompany allowlist tool names to upstream MCP server tool names.
 * Args are passed through unless a mapper reshapes them for the remote schema.
 */
export const MCP_TOOL_MAPPINGS: Record<string, Record<string, McpToolMapping>> = {
  figma: {
    get_design_context: {
      mcpTool: "get_figma_data",
      mapArgs: (args) => normalizeRecord(args),
    },
    export_screenshot: {
      mcpTool: "download_figma_images",
      mapArgs: (args) => normalizeRecord(args),
    },
  },
  github: {
    list_repos: {
      mcpTool: "search_repositories",
      mapArgs: (args) => {
        const record = normalizeRecord(args);
        return {
          query: typeof record.query === "string" ? record.query : "stars:>0 sort:updated",
          ...record,
        };
      },
    },
    create_branch: {
      mcpTool: "create_branch",
      mapArgs: (args) => normalizeRecord(args),
    },
    open_pr: {
      mcpTool: "create_pull_request",
      mapArgs: (args) => normalizeRecord(args),
    },
    read_issues: {
      mcpTool: "list_issues",
      mapArgs: (args) => normalizeRecord(args),
    },
  },
  supabase: {
    list_tables: {
      mcpTool: "list_tables",
      mapArgs: (args) => normalizeRecord(args),
    },
    apply_migration: {
      mcpTool: "apply_migration",
      mapArgs: (args) => normalizeRecord(args),
    },
    seed_sql: {
      mcpTool: "execute_sql",
      mapArgs: (args) => {
        const record = normalizeRecord(args);
        const query =
          typeof record.query === "string"
            ? record.query
            : typeof record.sql === "string"
              ? record.sql
              : undefined;
        if (!query) {
          throw new Error("seed_sql requires query or sql in args");
        }
        return { ...record, query };
      },
    },
  },
};

function normalizeRecord(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {};
  }
  return { ...(args as Record<string, unknown>) };
}

export function resolveMcpToolCall(
  integrationId: string,
  toolName: string,
  args: unknown,
): { mcpTool: string; mcpArgs: Record<string, unknown> } {
  const mapping = MCP_TOOL_MAPPINGS[integrationId]?.[toolName];
  if (!mapping) {
    return { mcpTool: toolName, mcpArgs: normalizeRecord(args) };
  }
  return {
    mcpTool: mapping.mcpTool,
    mcpArgs: mapping.mapArgs ? mapping.mapArgs(args) : normalizeRecord(args),
  };
}
