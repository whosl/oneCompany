import { eq } from "drizzle-orm";
import { events, humanGates } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { resetBroadcasts } from "../events/broadcast.js";
import { setupTestApp } from "../test-utils.js";
import { createGateService } from "./service.js";

describe("gate service — resume ordering", () => {
  it("keeps the gate open when onGateResolved throws", async () => {
    const { db, projects, cleanup } = setupTestApp();
    resetBroadcasts();
    try {
      const project = projects.createProject("Resume Failure");
      const gates = createGateService(db, () => undefined, {
        onGateResolved: async () => {
          throw new Error("resume failed");
        },
      });
      const gate = gates.createGate(project.id, "requirement_stuck");

      await expect(
        gates.resolveGate(gate.id, { decision: "keep_answering" }),
      ).rejects.toThrow(/resume failed/);

      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("open");
      expect(row?.decision).toBeNull();

      const resolvedEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .filter((event) => event.type === "human_gate.resolved");
      expect(resolvedEvents).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});
