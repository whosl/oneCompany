import { describe, expect, it } from "vitest";
import { resolveMcpToolCall } from "./tool-mapping.js";

describe("resolveMcpToolCall", () => {
  it("maps figma allowlist tools to figma-developer-mcp names", () => {
    expect(resolveMcpToolCall("figma", "get_design_context", { fileKey: "abc" })).toEqual({
      mcpTool: "get_figma_data",
      mcpArgs: { fileKey: "abc" },
    });
    expect(resolveMcpToolCall("figma", "export_screenshot", { fileKey: "abc" })).toEqual({
      mcpTool: "download_figma_images",
      mcpArgs: { fileKey: "abc" },
    });
  });

  it("maps github allowlist tools to server-github names", () => {
    expect(resolveMcpToolCall("github", "list_repos", {})).toMatchObject({
      mcpTool: "search_repositories",
      mcpArgs: { query: expect.any(String) },
    });
    expect(resolveMcpToolCall("github", "open_pr", { title: "x" })).toEqual({
      mcpTool: "create_pull_request",
      mcpArgs: { title: "x" },
    });
  });

  it("maps supabase seed_sql to execute_sql", () => {
    expect(resolveMcpToolCall("supabase", "seed_sql", { sql: "insert into t values (1)" })).toEqual({
      mcpTool: "execute_sql",
      mcpArgs: { sql: "insert into t values (1)", query: "insert into t values (1)" },
    });
  });

  it("passes through unknown tools unchanged", () => {
    expect(resolveMcpToolCall("linear", "list_issues", { team: "ENG" })).toEqual({
      mcpTool: "list_issues",
      mcpArgs: { team: "ENG" },
    });
  });
});
