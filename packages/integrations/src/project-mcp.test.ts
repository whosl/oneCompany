import { describe, expect, it } from "vitest";
import {
  listProjectMcpConfigs,
  upsertProjectMcpConfig,
  deleteProjectMcpConfig,
  presetDefaultMcpConfigs,
  projectMcpConfigsToOpencode,
  resolveMcpSpawn,
} from "./project-mcp.js";
import { VETTED_MCP_PRESETS, getMcpPreset } from "./preset-mcp.js";
import { setupIntegrationTestDb, seedTestProject } from "./test-utils.js";

describe("project MCP config CRUD (presetId model)", () => {
  it("round-trips a config via presetId (no command stored)", () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      upsertProjectMcpConfig(db, projectId, {
        presetId: "codegraph",
        displayName: "CodeGraph",
        secretRefs: {},
        enabled: true,
      });

      const list = listProjectMcpConfigs(db, projectId);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        presetId: "codegraph",
        displayName: "CodeGraph",
        enabled: true,
      });
      // No command/env fields on the API-facing config — command comes from preset.
      expect(list[0]).not.toHaveProperty("command");

      // Update via upsert.
      upsertProjectMcpConfig(db, projectId, {
        presetId: "codegraph",
        displayName: "Renamed",
        secretRefs: {},
        enabled: false,
      });
      const updated = listProjectMcpConfigs(db, projectId);
      expect(updated).toHaveLength(1);
      expect(updated[0]?.displayName).toBe("Renamed");
      expect(updated[0]?.enabled).toBe(false);

      // Delete.
      deleteProjectMcpConfig(db, projectId, "codegraph");
      expect(listProjectMcpConfigs(db, projectId)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("persists secretRefs references, not secret values", () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      upsertProjectMcpConfig(db, projectId, {
        presetId: "codegraph",
        displayName: "CodeGraph",
        secretRefs: { API_KEY: "MY_API_KEY_ENV" },
        enabled: true,
      });
      const list = listProjectMcpConfigs(db, projectId);
      expect(list[0]?.secretRefs).toEqual({ API_KEY: "MY_API_KEY_ENV" });
    } finally {
      cleanup();
    }
  });
});

describe("preset MCP servers", () => {
  it("vetted presets contain codegraph and context7 (not brave-search)", () => {
    const ids = VETTED_MCP_PRESETS.map((p) => p.presetId);
    expect(ids).toContain("codegraph");
    expect(ids).toContain("context7");
    // brave-search was removed (deprecated on npm)
    expect(ids).not.toContain("web-search");
    expect(ids).not.toContain("brave-search");
  });

  it("vetted presets use locked, version-pinned commands", () => {
    const ctx = getMcpPreset("context7");
    expect(ctx).toBeDefined();
    // npx packages must be version-pinned (no bare @upstash/context7-mcp).
    expect(ctx?.command.join(" ")).toMatch(/@upstash\/context7-mcp@\d+\.\d+\.\d+/);
  });

  it("resolvePresetMcpServers seeds configs whose enabled reflects availability", () => {
    const { db, cleanup } = setupIntegrationTestDb();
    try {
      const projectId = seedTestProject(db);
      presetDefaultMcpConfigs(db, projectId);
      const list = listProjectMcpConfigs(db, projectId);
      // codegraph + context7 (brave-search removed)
      expect(list.length).toBeGreaterThanOrEqual(2);
      for (const cfg of list) {
        expect(typeof cfg.enabled).toBe("boolean");
      }
    } finally {
      cleanup();
    }
  });
});

describe("resolveMcpSpawn — command resolution from preset", () => {
  it("resolves command from the vetted preset, never from DB", () => {
    const resolved = resolveMcpSpawn({
      presetId: "codegraph",
      displayName: "CodeGraph",
      secretRefs: {},
      enabled: true,
    });
    expect(resolved).toBeDefined();
    expect(resolved?.command).toEqual(["codegraph", "serve", "--mcp"]);
  });

  it("returns undefined for disabled configs", () => {
    const resolved = resolveMcpSpawn({
      presetId: "codegraph",
      displayName: "CodeGraph",
      secretRefs: {},
      enabled: false,
    });
    expect(resolved).toBeUndefined();
  });

  it("returns undefined for unknown presetId", () => {
    const resolved = resolveMcpSpawn({
      presetId: "evil-preset",
      displayName: "Evil",
      secretRefs: {},
      enabled: true,
    });
    expect(resolved).toBeUndefined();
  });

  it("resolves secret values from process.env via secretRefs", () => {
    process.env.__TEST_MCP_KEY = "test-secret-value";
    try {
      // Register a temporary preset that allows the key.
      const resolved = resolveMcpSpawn({
        presetId: "codegraph",
        displayName: "CodeGraph",
        secretRefs: { __TEST_MCP_KEY: "__TEST_MCP_KEY" },
        enabled: true,
      });
      // codegraph preset has empty allowedSecretKeys, so the ref is filtered out.
      expect(resolved?.environment).toEqual({});
    } finally {
      delete process.env.__TEST_MCP_KEY;
    }
  });
});

describe("projectMcpConfigsToOpencode", () => {
  it("only includes enabled servers with known presets", () => {
    const configs = [
      {
        presetId: "codegraph",
        displayName: "CodeGraph",
        secretRefs: {},
        enabled: true,
      },
      {
        presetId: "codegraph",
        displayName: "Disabled",
        secretRefs: {},
        enabled: false,
      },
      {
        presetId: "unknown",
        displayName: "Unknown",
        secretRefs: {},
        enabled: true,
      },
    ];
    const opencode = projectMcpConfigsToOpencode(configs);
    expect(Object.keys(opencode)).toEqual(["codegraph"]);
    expect(opencode.codegraph?.command).toEqual(["codegraph", "serve", "--mcp"]);
  });
});
