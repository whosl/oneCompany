import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { events, toolCalls } from "@oc/shared";
import { INLINE_OUTPUT_MAX_BYTES, persistOutput, readOutputText } from "@oc/workspace";
import { setupTestApp } from "../test-utils.js";

const FAKE_SECRET = "sk-fake1234567890abcdef";

describe("logging audit — M11 §8.2", () => {
  it("redacts secrets from command output and persisted tool_calls", async () => {
    const { workspace, db, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Logging Audit");
      const result = await workspace.runProjectCommand(project.id, `echo ${FAKE_SECRET}`);
      const output = readOutputText(result.outputRef);
      expect(output).not.toContain(FAKE_SECRET);

      const payloads = db
        .select({ payload: events.payload })
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .map((row) => row.payload)
        .join("\n");
      expect(payloads).not.toContain(FAKE_SECRET);
    } finally {
      cleanup();
    }
  });

  it("stores chunked output metadata without inline DB blobs", async () => {
    const { workspace, db, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Chunk Audit");
      const paths = workspace.ensureForProject(project);
      const toolCallId = "audit-chunk-tool";
      db.insert(toolCalls)
        .values({
          id: randomUUID(),
          project_id: project.id,
          tool_call_id: toolCallId,
          tool_name: "shell",
          status: "running",
          created_at: new Date().toISOString(),
        })
        .run();
      const ref = persistOutput(
        { db, projectId: project.id, logsPath: paths.logs, toolCallId },
        "x".repeat(INLINE_OUTPUT_MAX_BYTES + 64),
      );
      expect(ref.kind).toBe("chunk");

      const row = db
        .select()
        .from(toolCalls)
        .where(eq(toolCalls.tool_call_id, toolCallId))
        .all()[0];
      expect(row?.output_ref).toContain("chunk");
      expect((row?.output_ref ?? "").length).toBeLessThan(INLINE_OUTPUT_MAX_BYTES);
    } finally {
      cleanup();
    }
  });
});
