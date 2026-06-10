import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, events, projects, REDACTED } from "../index.js";
import { emit } from "./log.js";

function setupEmitDb() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oc-shared-emit-"));
  const dbPath = path.join(tempDir, "app.sqlite");
  process.env.OC_TEST_DB_PATH = dbPath;
  execSync("pnpm exec drizzle-kit push", {
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, OC_TEST_DB_PATH: dbPath },
    stdio: "pipe",
  });

  const db = createDb(dbPath);
  const projectId = randomUUID();
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id: projectId,
      name: "Emit Test",
      slug: `emit-${projectId.slice(0, 8)}`,
      status: "Draft Requirement",
      created_at: now,
      updated_at: now,
    })
    .run();

  return {
    db,
    projectId,
    cleanup: () => {
      delete process.env.OC_TEST_DB_PATH;
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

describe("emit — redaction", () => {
  it("redacts secret-like strings in agent.error payloads", () => {
    const { db, projectId, cleanup } = setupEmitDb();
    try {
      const secret = "sk-test1234567890abcdef";
      emit(db, {
        projectId,
        payload: {
          type: "agent.error",
          projectId,
          agentId: "analyst",
          runId: "run-1",
          message: `failed with ${secret}`,
        },
      });

      const rows = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all();
      const errorRow = rows.find((row) => row.type === "agent.error");
      expect(errorRow?.payload).not.toContain(secret);
      expect(errorRow?.payload).toContain(REDACTED);

      const incident = rows.find((row) => row.type === "redaction.incident");
      expect(incident).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});
