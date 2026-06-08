import { eq } from "drizzle-orm";
import { events, toolCalls } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { callTool } from "./tools.js";
import { seedProject, setupTestDb } from "./test-utils.js";

describe("callTool — M2", () => {
  it("emits started then output on success", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      const result = await callTool(
        { db, projectId },
        {
          toolName: "echo",
          args: { text: "hi" },
          impl: async () => "hello",
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.output).toBe("hello");
      }

      const eventTypes = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => row.type);
      expect(eventTypes).toEqual(["tool_call.started", "tool_call.output"]);

      const [row] = db.select().from(toolCalls).all();
      expect(row?.status).toBe("completed");
    } finally {
      cleanup();
    }
  });

  it("emits started then failed on error", async () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      const result = await callTool(
        { db, projectId },
        {
          toolName: "boom",
          args: {},
          impl: async () => {
            throw new Error("tool exploded");
          },
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("tool exploded");
      }

      const eventTypes = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all()
        .map((row) => row.type);
      expect(eventTypes).toEqual(["tool_call.started", "tool_call.failed"]);

      const [row] = db.select().from(toolCalls).all();
      expect(row?.status).toBe("failed");
    } finally {
      cleanup();
    }
  });
});
