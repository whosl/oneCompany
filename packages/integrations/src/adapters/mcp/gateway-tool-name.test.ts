import { describe, expect, it } from "vitest";
import { formatGatewayToolName, parseGatewayToolName } from "./gateway-tool-name.js";

describe("gateway tool names", () => {
  it("formats and parses oc_{integrationId}__{toolName}", () => {
    const prefixed = formatGatewayToolName("figma", "get_design_context");
    expect(prefixed).toBe("oc_figma__get_design_context");
    expect(parseGatewayToolName(prefixed)).toEqual({
      integrationId: "figma",
      toolName: "get_design_context",
    });
  });

  it("rejects invalid tool names", () => {
    expect(() => parseGatewayToolName("figma.get_design_context")).toThrow(/Invalid gateway tool/);
  });
});
