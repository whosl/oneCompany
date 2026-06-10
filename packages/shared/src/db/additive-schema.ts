import type Database from "better-sqlite3";

/** Add a column to an existing table when the local database predates it. */
function ensureColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  const columns = sqlite
    .prepare(`SELECT name FROM pragma_table_info('${table}')`)
    .all() as Array<{ name: string }>;
  // Empty list ⇒ table not created yet; the main bootstrap will create it
  // with the full column set, nothing to patch.
  if (columns.length > 0 && !columns.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/**
 * Adds post-MVP tables without reconciling or deleting legacy runtime tables.
 * Keep this bootstrap additive so existing local databases can open safely.
 */
export function ensureAdditiveIntegrationSchema(sqlite: Database.Database) {
  // change_requests grew columns after MVP; older local DBs miss them and
  // INSERTs fail with "table change_requests has no column named kind".
  ensureColumn(sqlite, "change_requests", "kind", "kind TEXT NOT NULL DEFAULT 'skip_slice'");
  ensureColumn(sqlite, "change_requests", "impact_summary", "impact_summary TEXT");
  ensureColumn(sqlite, "change_requests", "affected_commits", "affected_commits TEXT");

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
