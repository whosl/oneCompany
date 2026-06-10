import type Database from "better-sqlite3";

/**
 * Adds post-MVP tables without reconciling or deleting legacy runtime tables.
 * Keep this bootstrap additive so existing local databases can open safely.
 */
export function ensureAdditiveIntegrationSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS integration_definitions (
      id TEXT PRIMARY KEY NOT NULL,
      integration_id TEXT NOT NULL,
      version TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integration_connections (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      integration_version TEXT NOT NULL,
      account_label TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS integration_tool_calls (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      integration_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      event_id TEXT,
      output_ref TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS skill_packs (
      id TEXT PRIMARY KEY NOT NULL,
      pack_id TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      root_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_pack_runs (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      recipe TEXT NOT NULL,
      status TEXT NOT NULL,
      artifact_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `);
}
