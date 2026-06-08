import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toolCalls } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { INLINE_OUTPUT_MAX_BYTES, REDACTED, persistOutput, redact } from "./log-pipeline.js";
import { seedProject, setupTestDb } from "./test-utils.js";

describe("log pipeline — M5", () => {
  it("redacts secret-like tokens and env values", () => {
    const secret = "sk-test1234567890abcdef";
    const result = redact(`token=${secret}`, { FAKE_OPENAI_KEY: secret });
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain(REDACTED);
    expect(result.incidents.length).toBeGreaterThan(0);
  });

  it("chunks large output to logs and stores metadata only in DB", () => {
    const { db, cleanup } = setupTestDb();
    const logsPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-logs-"));
    const toolCallId = "tool-large-1";
    const projectId = seedProject(db);

    db.insert(toolCalls)
      .values({
        id: randomUUID(),
        project_id: projectId,
        tool_call_id: toolCallId,
        tool_name: "shell",
        status: "running",
        created_at: new Date().toISOString(),
      })
      .run();

    const large = "x".repeat(INLINE_OUTPUT_MAX_BYTES + 32);
    const ref = persistOutput({ db, projectId, logsPath, toolCallId }, large);

    expect(ref.kind).toBe("chunk");
    if (ref.kind === "chunk") {
      expect(fs.existsSync(ref.path)).toBe(true);
      expect(ref.byteLength).toBeGreaterThan(INLINE_OUTPUT_MAX_BYTES);
    }

    const row = db.select().from(toolCalls).all().find((entry) => entry.tool_call_id === toolCallId);
    expect(row?.output_ref).toContain("chunk");

    fs.rmSync(logsPath, { recursive: true, force: true });
    cleanup();
  });
});
