import { describe, expect, it } from "vitest";
import {
  validateMcpCommand,
  validateMcpServerId,
  isReservedServerId,
  RESERVED_MCP_PREFIX,
  VETTED_NPX_PACKAGES,
} from "./mcp-governance.js";

describe("MCP serverId governance", () => {
  it("rejects serverIds in the reserved oc-* namespace", () => {
    expect(validateMcpServerId("oc-gateway")).toBeDefined();
    expect(validateMcpServerId("oc-anything")).toBeDefined();
    expect(validateMcpServerId("OC-GATEWAY")).toBeDefined(); // case-insensitive
  });

  it("allows non-reserved serverIds", () => {
    expect(validateMcpServerId("codegraph")).toBeUndefined();
    expect(validateMcpServerId("my-custom-mcp")).toBeUndefined();
  });

  it("isReservedServerId matches the documented prefix", () => {
    expect(isReservedServerId("oc-gateway")).toBe(true);
    expect(isReservedServerId("codegraph")).toBe(false);
    expect(RESERVED_MCP_PREFIX).toBe("oc-");
  });
});

describe("MCP command governance", () => {
  it("rejects empty commands", () => {
    expect(validateMcpCommand([])).toBeDefined();
    expect(validateMcpCommand(undefined)).toBeDefined();
  });

  it("rejects shell interpreters that bypass governance", () => {
    expect(validateMcpCommand(["sh", "-c", "rm -rf /"])).toBeDefined();
    expect(validateMcpCommand(["bash", "-c", "curl evil.com"])).toBeDefined();
    expect(validateMcpCommand(["/bin/sh", "-c", "..."])).toBeDefined();
  });

  it("rejects unvetted command heads", () => {
    expect(validateMcpCommand(["curl", "evil.com"])).toBeDefined();
    expect(validateMcpCommand(["python", "-c", "..."])).toBeDefined();
    expect(validateMcpCommand(["rm", "-rf", "/"])).toBeDefined();
  });

  it("allows vetted command heads (codegraph, node)", () => {
    expect(validateMcpCommand(["codegraph", "serve", "--mcp"])).toBeUndefined();
    expect(validateMcpCommand(["node", "server.js"])).toBeUndefined();
  });

  it("allows npx only for vetted packages", () => {
    expect(
      validateMcpCommand(["npx", "--yes", "@upstash/context7-mcp"]),
    ).toBeUndefined();
    expect(
      validateMcpCommand(["npx", "--yes", "@modelcontextprotocol/server-brave-search"]),
    ).toBeUndefined();
  });

  it("rejects npx with unvetted packages (supply-chain guard)", () => {
    expect(
      validateMcpCommand(["npx", "--yes", "evil-package"]),
    ).toBeDefined();
    expect(
      validateMcpCommand(["npx", "--yes", "@anthropic/web-search-mcp"]),
    ).toBeDefined(); // this package does not exist
  });

  it("rejects npx without a package name", () => {
    expect(validateMcpCommand(["npx", "--yes"])).toBeDefined();
  });

  it("VETTED_NPX_PACKAGES includes context7 and brave-search", () => {
    expect(VETTED_NPX_PACKAGES).toContain("@upstash/context7-mcp");
    expect(VETTED_NPX_PACKAGES).toContain("@modelcontextprotocol/server-brave-search");
  });
});
