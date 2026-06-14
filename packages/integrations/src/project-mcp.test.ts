import { describe, expect, it } from "vitest";
import {
  listProjectMcpConfigs,
  upsertProjectMcpConfig,
  deleteProjectMcpConfig,
  presetDefaultMcpConfigs,
  projectMcpConfigsToOpencode,
} from "./project-mcp.js";
import { PRESET_MCP_SERVERS, resolvePresetMcpServers } from "./preset-mcp.js";
import { setupIntegrationTestDb, seedTestProject } from "./test-utils.js";

describe("project MCP config CRUD", () => {
  it("round-trips an MCP server config", () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      upsertProjectMcpConfig(db, projectId, {
        serverId: "custom-mcp",
        displayName: "Custom MCP",
        transport: "local",
        command: ["node", "server.js"],
        env: { API_KEY: "xxx" },
        toolAllowlist: ["tool_a"],
        enabled: true,
      });

      const list = listProjectMcpConfigs(db, projectId);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        serverId: "custom-mcp",
        displayName: "Custom MCP",
        transport: "local",
        command: ["node", "server.js"],
        enabled: true,
      });

      // Update via upsert (same serverId).
      upsertProjectMcpConfig(db, projectId, {
        serverId: "custom-mcp",
        displayName: "Renamed",
        transport: "local",
        command: ["node", "server.js"],
        enabled: false,
      });
      const updated = listProjectMcpConfigs(db, projectId);
      expect(updated).toHaveLength(1);
      expect(updated[0]?.displayName).toBe("Renamed");
      expect(updated[0]?.enabled).toBe(false);

      // Delete.
      deleteProjectMcpConfig(db, projectId, "custom-mcp");
      expect(listProjectMcpConfigs(db, projectId)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("preserves tool allowlist null (passthrough) vs explicit list", () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      upsertProjectMcpConfig(db, projectId, {
        serverId: "passthrough",
        displayName: "Passthrough",
        transport: "local",
        command: ["tool"],
        toolAllowlist: null,
        enabled: true,
      });
      upsertProjectMcpConfig(db, projectId, {
        serverId: "restricted",
        displayName: "Restricted",
        transport: "local",
        command: ["tool"],
        toolAllowlist: ["only_this"],
        enabled: true,
      });

      const list = listProjectMcpConfigs(db, projectId);
      const passthrough = list.find((c) => c.serverId === "passthrough");
      const restricted = list.find((c) => c.serverId === "restricted");
      expect(passthrough?.toolAllowlist).toBeNull();
      expect(restricted?.toolAllowlist).toEqual(["only_this"]);
    } finally {
      cleanup();
    }
  });
});

describe("preset MCP servers", () => {
  it("defines codegraph, context7, and web-search presets", () => {
    const ids = PRESET_MCP_SERVERS.map((s) => s.serverId);
    expect(ids).toEqual(expect.arrayContaining(["codegraph", "context7", "web-search"]));
  });

  it("resolvePresetMcpServers returns configs whose enabled reflects availability", () => {
    const resolved = resolvePresetMcpServers();
    const codegraph = resolved.find((c) => c.serverId === "codegraph");
    expect(codegraph).toBeDefined();
    expect(typeof codegraph?.enabled).toBe("boolean");
  });

  it("presetDefaultMcpConfigs seeds exactly three servers", () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      presetDefaultMcpConfigs(db, projectId);
      const list = listProjectMcpConfigs(db, projectId);
      expect(list).toHaveLength(3);
      expect(list.map((c) => c.serverId).sort()).toEqual([
        "codegraph",
        "context7",
        "web-search",
      ]);
    } finally {
      cleanup();
    }
  });
});

describe("projectMcpConfigsToOpencode", () => {
  it("only includes enabled local servers in opencode format", () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      presetDefaultMcpConfigs(db, projectId);
      const configs = listProjectMcpConfigs(db, projectId);
      const opencode = projectMcpConfigsToOpencode(configs);

      for (const entry of Object.values(opencode)) {
        expect(entry.enabled).toBe(true);
        expect(entry.type).toBe("local");
        expect(entry.command.length).toBeGreaterThan(0);
      }
    } finally {
      cleanup();
    }
  });

  it("skips disabled servers entirely", () => {
    const configs = [
      {
        serverId: "disabled-one",
        displayName: "Disabled",
        transport: "local" as const,
        command: ["cmd"],
        enabled: false,
      },
      {
        serverId: "enabled-one",
        displayName: "Enabled",
        transport: "local" as const,
        command: ["cmd"],
        enabled: true,
      },
    ];
    const opencode = projectMcpConfigsToOpencode(configs);
    expect(Object.keys(opencode)).toEqual(["enabled-one"]);
  });

  it("excludes servers with an explicit toolAllowlist (cannot be enforced on opencode path)", () => {
    const configs = [
      {
        serverId: "passthrough",
        displayName: "Passthrough",
        transport: "local" as const,
        command: ["codegraph", "serve", "--mcp"],
        toolAllowlist: null,
        enabled: true,
      },
      {
        serverId: "restricted",
        displayName: "Restricted",
        transport: "local" as const,
        command: ["codegraph", "serve", "--mcp"],
        toolAllowlist: ["only_this"],
        enabled: true,
      },
    ];
    const opencode = projectMcpConfigsToOpencode(configs);
    // Only the passthrough (null allowlist) server is injected; the restricted
    // one is excluded because opencode direct-connect cannot honor the allowlist.
    expect(Object.keys(opencode)).toEqual(["passthrough"]);
  });
});
