import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureAdditiveIntegrationSchema } from "./additive-schema.js";
import { INTEGRATION_TABLE_NAMES } from "./mvp-tables.js";

describe("additive integration schema", () => {
  it("adds integration tables without changing legacy tables or rows", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE checkpoints (thread_id TEXT NOT NULL, value TEXT NOT NULL);
      INSERT INTO checkpoints (thread_id, value) VALUES ('thread-1', 'preserve-me');
    `);

    ensureAdditiveIntegrationSchema(sqlite);
    ensureAdditiveIntegrationSchema(sqlite);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const names = new Set(tables.map((table) => table.name));
    const checkpoint = sqlite
      .prepare("SELECT thread_id, value FROM checkpoints")
      .get() as { thread_id: string; value: string };

    expect(names.has("checkpoints")).toBe(true);
    expect(INTEGRATION_TABLE_NAMES.every((name) => names.has(name))).toBe(true);
    expect(checkpoint).toEqual({ thread_id: "thread-1", value: "preserve-me" });

    sqlite.close();
  });
});
