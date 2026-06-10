import { describe, expect, it } from "vitest";
import { formatGatewayToolName } from "./index.js";

describe("oc-gateway-mcp helpers", () => {
  it("formats prefixed tool names for opencode", () => {
    expect(formatGatewayToolName("github", "list_repos")).toBe("oc_github__list_repos");
  });
});
