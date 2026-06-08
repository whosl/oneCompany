import { eq } from "drizzle-orm";
import { events, humanGates } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("gates API — M1", () => {
  it("createGate persists an open row and emits human_gate.created", () => {
    const { projects, gates, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Gate Demo");
      const gate = gates.createGate(project.id, "requirement_confirm");

      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("open");

      const gateEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .filter((event) => event.type === "human_gate.created");
      expect(gateEvents).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("resolveGate resolves via API and emits human_gate.resolved", async () => {
    const { app, projects, gates, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Resolve Demo");
      const gate = gates.createGate(project.id, "requirement_confirm");

      const response = await app.request(`/gates/${gate.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });

      expect(response.status).toBe(200);
      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("resolved");
      expect(row?.decision).toBe("approve");

      const resolvedEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .filter((event) => event.type === "human_gate.resolved");
      expect(resolvedEvents).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("waitForGate returns after resolveGate is called", async () => {
    const { projects, gates, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Wait Demo");
      const gate = gates.createGate(project.id, "requirement_stuck");

      const waitPromise = gates.waitForGate(gate.id, { pollMs: 20, timeoutMs: 2000 });
      setTimeout(() => {
        void gates.resolveGate(gate.id, { decision: "keep_answering" });
      }, 50);

      await expect(waitPromise).resolves.toBe("keep_answering");
    } finally {
      cleanup();
    }
  });
});
