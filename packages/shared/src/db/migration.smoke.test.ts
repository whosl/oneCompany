import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { MVP_TABLE_COUNT, MVP_TABLE_NAMES } from "./mvp-tables.js";

describe("migration smoke — M0 baseline", () => {
  it(`creates all ${MVP_TABLE_COUNT} MVP tables via drizzle-kit push`, () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "oc-m0-migrate-"));
    const dbPath = path.join(tempDir, "app.sqlite");

    try {
      execSync("pnpm exec drizzle-kit push", {
        cwd: path.resolve(process.cwd()),
        env: { ...process.env, OC_TEST_DB_PATH: dbPath },
        stdio: "pipe",
      });

      const db = new Database(dbPath);
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      db.close();

      const tableNames = rows.map((row) => row.name);
      expect(tableNames).toHaveLength(MVP_TABLE_COUNT);
      expect(tableNames).toEqual([...MVP_TABLE_NAMES].sort());
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
