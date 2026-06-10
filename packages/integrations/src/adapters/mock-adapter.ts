import type { ConnectorAdapter, ConnectorRegistry } from "../connectors/types.js";

function mockAdapter(
  integrationId: string,
  responses: Record<string, (args: unknown) => unknown>,
): ConnectorAdapter {
  return {
    integrationId,
    async callTool(toolName, context) {
      const handler = responses[toolName];
      if (!handler) {
        throw new Error(`Mock adapter has no handler for ${toolName}`);
      }
      return handler(context.args);
    },
  };
}

export const MOCK_CONNECTOR_ADAPTERS: ConnectorRegistry = {
  playwright: mockAdapter("playwright", {
    screenshot: () => ({ path: "artifacts/playwright-screenshot.png", untrusted: false }),
    console_errors: () => ({ count: 0, errors: [] }),
    navigate: (args) => ({ url: (args as { url?: string })?.url ?? "http://127.0.0.1:4173" }),
  }),
  figma: mockAdapter("figma", {
    get_design_context: () => ({ nodes: 1, untrusted: true, hint: "design reference only" }),
    export_screenshot: () => ({ path: "artifacts/figma-export.png" }),
  }),
  github: mockAdapter("github", {
    list_repos: () => ({ repos: [{ name: "generated-app", private: false }] }),
    create_branch: (args) => ({
      branch: (args as { branch?: string })?.branch ?? "feature/offline-handoff",
    }),
    open_pr: () => ({ url: "https://github.com/example/repo/pull/1", simulated: true }),
    read_issues: () => ({ issues: [] }),
  }),
  supabase: mockAdapter("supabase", {
    list_tables: () => ({ tables: ["users", "todos"] }),
    apply_migration: () => ({ applied: true, environment: "dev" }),
    seed_sql: () => ({ rowsInserted: 3 }),
  }),
  vercel: mockAdapter("vercel", {
    list_projects: () => ({ projects: [{ name: "generated-app" }] }),
    create_preview_deploy: () => ({
      url: "https://preview.example.vercel.app",
      deploymentId: "dpl_mock",
    }),
    read_logs: () => ({ lines: ["build complete"] }),
  }),
};
