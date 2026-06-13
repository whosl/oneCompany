import { describe, expect, it } from "vitest";
import { INTEGRATION_TABLE_COUNT, INTEGRATION_TABLE_NAMES } from "./mvp-tables.js";

describe("integration tables — M12", () => {
  it("tracks the post-MVP integration tables including project MCP configs", () => {
    expect(INTEGRATION_TABLE_COUNT).toBe(6);
    expect([...INTEGRATION_TABLE_NAMES]).toEqual([
      "integration_definitions",
      "integration_connections",
      "integration_tool_calls",
      "skill_packs",
      "skill_pack_runs",
      "project_mcp_configs",
    ]);
  });
});
