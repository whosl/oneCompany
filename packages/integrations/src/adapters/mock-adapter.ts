import type { ConnectorAdapter, ConnectorCallContext, ConnectorRegistry } from "../connectors/types.js";
import { writeMockPng } from "./mock-artifact.js";

type MockHandler = (context: ConnectorCallContext) => unknown;

function mockAdapter(
  integrationId: string,
  responses: Record<string, MockHandler>,
): ConnectorAdapter {
  return {
    integrationId,
    async callTool(toolName, context) {
      const handler = responses[toolName];
      if (!handler) {
        throw new Error(`Mock adapter has no handler for ${toolName}`);
      }
      return handler(context);
    },
  };
}

export const MOCK_CONNECTOR_ADAPTERS: ConnectorRegistry = {
  playwright: mockAdapter("playwright", {
    screenshot: (context) => {
      const label =
        context.args && typeof context.args === "object" && "label" in context.args
          ? String((context.args as { label?: string }).label ?? "screenshot")
          : "screenshot";
      const { path: artifactPath } = writeMockPng(
        context.artifactsPath,
        `playwright-${label}-mock.png`,
      );
      return { path: artifactPath, untrusted: false };
    },
    console_errors: () => ({ count: 0, errors: [] }),
    navigate: (context) => ({
      url:
        context.args && typeof context.args === "object" && "url" in context.args
          ? String((context.args as { url?: string }).url ?? "http://127.0.0.1:4173")
          : "http://127.0.0.1:4173",
    }),
  }),
  figma: mockAdapter("figma", {
    get_design_context: () => ({ nodes: 1, untrusted: true, hint: "design reference only" }),
    export_screenshot: (context) => {
      const { path: artifactPath } = writeMockPng(context.artifactsPath, "figma-export-mock.png");
      return { path: artifactPath };
    },
  }),
  github: mockAdapter("github", {
    list_repos: () => ({ repos: [{ name: "generated-app", private: false }] }),
    create_branch: (context) => ({
      branch:
        context.args && typeof context.args === "object" && "branch" in context.args
          ? String((context.args as { branch?: string }).branch ?? "feature/offline-handoff")
          : "feature/offline-handoff",
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
