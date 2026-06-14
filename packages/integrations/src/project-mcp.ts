import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { projectMcpConfigs, type Db, type ProjectMcpConfig } from "@oc/shared";
import { getMcpPreset, resolvePresetMcpServers, type VettedMcpPreset } from "./preset-mcp.js";

// ---------------------------------------------------------------------------
// Row <-> config mapping
// ---------------------------------------------------------------------------

type ProjectMcpConfigRow = typeof projectMcpConfigs.$inferSelect;

function rowToConfig(row: ProjectMcpConfigRow): ProjectMcpConfig {
  return {
    presetId: row.server_id,
    displayName: row.display_name,
    secretRefs: row.env_json ? (JSON.parse(row.env_json) as Record<string, string>) : undefined,
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
  presetId: string,
): ProjectMcpConfig | undefined {
  const row = db
    .select()
    .from(projectMcpConfigs)
    .where(eq(projectMcpConfigs.project_id, projectId))
    .all()
    .find((r) => r.server_id === presetId);
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
    .find((row) => row.server_id === config.presetId);

  if (existing) {
    db.update(projectMcpConfigs)
      .set({
        display_name: config.displayName,
        env_json: config.secretRefs ? JSON.stringify(config.secretRefs) : null,
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
      server_id: config.presetId,
      display_name: config.displayName,
      transport: "local",
      command_json: JSON.stringify([]), // command is resolved from preset, not stored per-project
      env_json: config.secretRefs ? JSON.stringify(config.secretRefs) : null,
      enabled: config.enabled ? 1 : 0,
      created_at: now,
      updated_at: now,
    })
    .run();
}

export function deleteProjectMcpConfig(db: Db, projectId: string, presetId: string): void {
  const rows = db
    .select()
    .from(projectMcpConfigs)
    .where(eq(projectMcpConfigs.project_id, projectId))
    .all();
  const target = rows.find((row) => row.server_id === presetId);
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
// Spawn resolution: presetId -> locked command + resolved env (from process.env)
// ---------------------------------------------------------------------------

export interface ResolvedMcpSpawn {
  serverId: string;
  command: readonly string[];
  /** Resolved env values from process.env (secrets never come from the DB). */
  environment: Record<string, string>;
  enabled: boolean;
}

/**
 * Resolve a project MCP config into a spawnable command. The command comes
 * from the vetted preset (locked); env values are resolved from process.env
 * via the stored secretRefs (TARGET -> SOURCE). Returns undefined if the
 * preset is unknown or the server is disabled.
 */
export function resolveMcpSpawn(config: ProjectMcpConfig): ResolvedMcpSpawn | undefined {
  if (!config.enabled) return undefined;
  const preset = getMcpPreset(config.presetId);
  if (!preset) return undefined;

  const environment: Record<string, string> = {};
  if (config.secretRefs) {
    for (const [target, source] of Object.entries(config.secretRefs)) {
      // Only allow resolving keys the preset declares.
      if (!preset.allowedSecretKeys.includes(target)) continue;
      const value = process.env[source]?.trim();
      if (value) {
        environment[target] = value;
      }
    }
  }

  return {
    serverId: preset.presetId,
    command: preset.command,
    environment,
    enabled: true,
  };
}

/**
 * Convert project MCP configs into the opencode server `Config["mcp"]` shape.
 * Commands are always from the vetted preset registry; env values resolved
 * from process.env via secretRefs. Disabled or unresolvable servers are skipped.
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
    const resolved = resolveMcpSpawn(config);
    if (!resolved) continue;
    result[resolved.serverId] = {
      type: "local",
      command: [...resolved.command],
      environment: Object.keys(resolved.environment).length > 0 ? resolved.environment : undefined,
      enabled: true,
      timeout: 30_000,
    };
  }
  return result;
}

/** Re-export for callers that need preset metadata. */
export { VettedMcpPreset };
