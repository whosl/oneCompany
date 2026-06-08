import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, projects, type Db } from "@oc/shared";

export function setupTestDb(): { db: Db; cleanup: () => void } {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oc-agent-core-test-"));
  const dbPath = path.join(tempDir, "app.sqlite");
  process.env.OC_TEST_DB_PATH = dbPath;

  execSync("pnpm exec drizzle-kit push", {
    cwd: path.resolve(process.cwd(), "../shared"),
    env: { ...process.env, OC_TEST_DB_PATH: dbPath },
    stdio: "pipe",
  });

  const db = createDb(dbPath);

  return {
    db,
    cleanup: () => {
      delete process.env.OC_TEST_DB_PATH;
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function seedProject(db: Db, name = "M2 Test Project"): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id,
      name,
      slug: `m2-${id.slice(0, 8)}`,
      status: "Draft Requirement",
      created_at: now,
      updated_at: now,
    })
    .run();
  return id;
}
