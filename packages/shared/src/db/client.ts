import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureAdditiveIntegrationSchema } from "./additive-schema.js";
import * as schema from "./schema.js";
import { getDbPath } from "./paths.js";

export function createDb(dbPath?: string) {
  const resolvedPath = dbPath ?? getDbPath();
  const sqlite = new Database(resolvedPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureAdditiveIntegrationSchema(sqlite);
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
