import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { projectMcpConfigs, type Db, type ProjectMcpConfig } from "@oc/shared";
import { resolvePresetMcpServers } from "./preset-mcp.js";

// ---------------------------------------------------------------------------
// Row <-> config mapping
// ---------------------------------------------------------------------------

type ProjectMcpConfigRow = typeof projectMcpConfigs.$inferSelect;

function rowToConfig(row: ProjectMcpConfigRow): ProjectMcpConfig {
  return {
    serverId: row.server_id,
    displayName: row.display_name,
    transport: row.transport as "local" | "remote",
    command: row.command_json ? (JSON.parse(row.command_json) as string[]) : undefined,
    url: row.args_json ? (JSON.parse(row.args_json) as { url?: string }).url : undefined,
    env: row.env_json ? (JSON.parse(row.env_json) as Record<string, string>) : undefined,
    cwd: row.cwd ?? undefined,
    toolAllowlist: row.tool_allowlist_json
      ? (JSON.parse(row.tool_allowlist_json) as string[])
      : null,
    enabled: row.enabled === 1,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listProjectMcpConfigs(db: Db, projectId: string): ProjectMcpConfig[] {
  return db
    .select()
    .from(projectMcpConfigs)
    .where(eq(projectMcpConfigs.project_id, projectId))
    .all()
    .map(rowToConfig);
}

export function getProjectMcpConfig(
  db: Db,
  projectId: string,
  serverId: string,
): ProjectMcpConfig | undefined {
  const row = db
    .select()
    .from(projectMcpConfigs)
    .where(eq(projectMcpConfigs.project_id, projectId))
    .all()
    .find((r) => r.server_id === serverId);
  return row ? rowToConfig(row) : undefined;
}

export function upsertProjectMcpConfig(
  db: Db,
  projectId: string,
  config: ProjectMcpConfig,
): void {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(projectMcpConfigs)
    .where(eq(projectMcpConfigs.project_id, projectId))
    .all()
    .find((row) => row.server_id === config.serverId);

  if (existing) {
    db.update(projectMcpConfigs)
      .set({
        display_name: config.displayName,
        transport: config.transport,
        command_json: JSON.stringify(config.command ?? []),
        args_json: config.url ? JSON.stringify({ url: config.url }) : null,
        env_json: config.env ? JSON.stringify(config.env) : null,
        cwd: config.cwd ?? null,
        tool_allowlist_json: config.toolAllowlist ? JSON.stringify(config.toolAllowlist) : null,
        enabled: config.enabled ? 1 : 0,
        updated_at: now,
      })
      .where(eq(projectMcpConfigs.id, existing.id))
      .run();
    return;
  }

  db.insert(projectMcpConfigs)
    .values({
      id: randomUUID(),
      project_id: projectId,
      server_id: config.serverId,
      display_name: config.displayName,
      transport: config.transport,
      command_json: JSON.stringify(config.command ?? []),
      args_json: config.url ? JSON.stringify({ url: config.url }) : null,
      env_json: config.env ? JSON.stringify(config.env) : null,
      cwd: config.cwd ?? null,
      tool_allowlist_json: config.toolAllowlist ? JSON.stringify(config.toolAllowlist) : null,
      enabled: config.enabled ? 1 : 0,
      created_at: now,
      updated_at: now,
    })
    .run();
}

export function deleteProjectMcpConfig(db: Db, projectId: string, serverId: string): void {
  const rows = db
    .select()
    .from(projectMcpConfigs)
    .where(eq(projectMcpConfigs.project_id, projectId))
    .all();
  const target = rows.find((row) => row.server_id === serverId);
  if (target) {
    db.delete(projectMcpConfigs).where(eq(projectMcpConfigs.id, target.id)).run();
  }
}

/** Seed the default MCP servers for a freshly created project. */
export function presetDefaultMcpConfigs(db: Db, projectId: string): void {
  for (const config of resolvePresetMcpServers()) {
    upsertProjectMcpConfig(db, projectId, config);
  }
}

// ---------------------------------------------------------------------------
// Format conversion for the two agent paths
// ---------------------------------------------------------------------------

/**
 * Convert project MCP configs into the opencode server `Config["mcp"]` shape
 * (for the code agent / opencode harness path). Only enabled local servers
 * are included.
 */
export function projectMcpConfigsToOpencode(
  configs: ProjectMcpConfig[],
): Record<string, { type: "local"; command: string[]; environment?: Record<string, string>; enabled: boolean; timeout?: number }> {
  const result: Record<string, {
    type: "local";
    command: string[];
    environment?: Record<string, string>;
    enabled: boolean;
    timeout?: number;
  }> = {};
  for (const config of configs) {
    if (!config.enabled) continue;
    if (config.transport === "local" && config.command) {
      result[config.serverId] = {
        type: "local",
        command: config.command,
        environment: config.env,
        enabled: true,
        timeout: 30_000,
      };
    }
  }
  return result;
}
