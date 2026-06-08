import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client.js";
import { projects } from "../db/schema.js";
import { emit, listEvents } from "./log.js";

describe("event log — M1", () => {
  let tempDir = "";
  let dbPath = "";

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "oc-m1-events-"));
    dbPath = path.join(tempDir, "app.sqlite");
    process.env.OC_TEST_DB_PATH = dbPath;
    execSync("pnpm exec drizzle-kit push", {
      cwd: path.resolve(process.cwd()),
      env: { ...process.env, OC_TEST_DB_PATH: dbPath },
      stdio: "pipe",
    });
  });

  afterEach(() => {
    delete process.env.OC_TEST_DB_PATH;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("assigns monotonic seq 1, 2, 3 for one project", () => {
    const db = createDb(dbPath);
    db.insert(projects).values({
      id: "proj-events",
      name: "Events",
      slug: "events",
      status: "Draft Requirement",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).run();

    const first = emit(db, {
      projectId: "proj-events",
      payload: { type: "project.created", projectId: "proj-events", name: "Events" },
    });
    const second = emit(db, {
      projectId: "proj-events",
      payload: { type: "project.status_changed", projectId: "proj-events", status: "Asking Questions" },
    });
    const third = emit(db, {
      projectId: "proj-events",
      payload: { type: "human_gate.created", projectId: "proj-events", gateId: "g1", gateType: "test" },
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(third.seq).toBe(3);
    expect(first.eventId).not.toBe(second.eventId);
    expect(first.schemaVersion).toBe("1");
    expect(first.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("lists events after a seq cursor in order", () => {
    const db = createDb(dbPath);
    db.insert(projects).values({
      id: "proj-replay",
      name: "Replay",
      slug: "replay",
      status: "Draft Requirement",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).run();

    emit(db, {
      projectId: "proj-replay",
      payload: { type: "project.created", projectId: "proj-replay", name: "Replay" },
    });
    emit(db, {
      projectId: "proj-replay",
      payload: { type: "project.status_changed", projectId: "proj-replay", status: "Asking Questions" },
    });
    emit(db, {
      projectId: "proj-replay",
      payload: { type: "project.status_changed", projectId: "proj-replay", status: "PRD Ready" },
    });

    const replayed = listEvents(db, "proj-replay", { afterSeq: 1 });
    expect(replayed).toHaveLength(2);
    expect(replayed[0]?.seq).toBe(2);
    expect(replayed[1]?.seq).toBe(3);
  });
});
