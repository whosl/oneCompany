import { eq } from "drizzle-orm";
import { events, humanGates } from "@oc/shared";
import { describe, expect, it, vi } from "vitest";
import { resetBroadcasts } from "../events/broadcast.js";
import { setupTestApp } from "../test-utils.js";
import { createGateService } from "./service.js";

describe("gate service — resume ordering", () => {
  it("resolves the gate before fire-and-forget resume callbacks", async () => {
    const { db, projects, cleanup } = setupTestApp();
    resetBroadcasts();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const project = projects.createProject("Resume Failure");
      const gates = createGateService(db, () => undefined, {
        onGateResolved: async () => {
          throw new Error("resume failed");
        },
      });
      const gate = gates.createGate(project.id, "requirement_stuck");

      const resolved = await gates.resolveGate(gate.id, { decision: "keep_answering" });
      expect(resolved.status).toBe("resolved");
      expect(resolved.decision).toBe("keep_answering");

      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("resolved");
      expect(row?.decision).toBe("keep_answering");

      const resolvedEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .filter((event) => event.type === "human_gate.resolved");
      expect(resolvedEvents).toHaveLength(1);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(`gate resume failed for ${gate.id}`),
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
      cleanup();
    }
  });
});
