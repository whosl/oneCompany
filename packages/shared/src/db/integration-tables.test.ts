import { describe, expect, it } from "vitest";
import { INTEGRATION_TABLE_COUNT, INTEGRATION_TABLE_NAMES } from "./mvp-tables.js";

describe("integration tables — M12", () => {
  it("tracks five post-MVP integration tables", () => {
    expect(INTEGRATION_TABLE_COUNT).toBe(5);
    expect([...INTEGRATION_TABLE_NAMES]).toEqual([
      "integration_definitions",
      "integration_connections",
      "integration_tool_calls",
      "skill_packs",
      "skill_pack_runs",
    ]);
  });
});
