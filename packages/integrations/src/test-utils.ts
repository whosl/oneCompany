import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, projects, type Db } from "@oc/shared";
import { seedDefaultIntegrations } from "./registry.js";

export function seedTestProject(db: Db, name = "Integrations Test Project"): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id,
      name,
      slug: `int-${id.slice(0, 8)}`,
      status: "Developing",
      created_at: now,
      updated_at: now,
    })
    .run();
  return id;
}

export function setupIntegrationTestDb(): { db: Db; cleanup: () => void } {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oc-integrations-test-"));
  const dbPath = path.join(tempDir, "app.sqlite");
  process.env.OC_TEST_DB_PATH = dbPath;

  execSync("pnpm exec drizzle-kit push", {
    cwd: path.resolve(process.cwd(), "../shared"),
    env: { ...process.env, OC_TEST_DB_PATH: dbPath },
    stdio: "pipe",
  });

  seedDefaultIntegrations();

  return {
    db: createDb(dbPath),
    cleanup: () => {
      delete process.env.OC_TEST_DB_PATH;
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
