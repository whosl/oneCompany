import { eq } from "drizzle-orm";
import { events, GateResumeFailedError, humanGates } from "@oc/shared";
import { describe, expect, it, vi } from "vitest";
import { resetBroadcasts } from "../events/broadcast.js";
import { setupTestApp } from "../test-utils.js";
import { createGateService } from "./service.js";

describe("gate service — resume ordering", () => {
  it("keeps gate open and throws when resume fails", async () => {
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
      ).rejects.toBeInstanceOf(GateResumeFailedError);

      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("open");
      expect(row?.decision).toBeNull();

      const projectEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all();
      expect(projectEvents.filter((event) => event.type === "human_gate.resolved")).toHaveLength(0);
      expect(projectEvents.filter((event) => event.type === "human_gate.created")).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("resolves gate only after resume succeeds", async () => {
    const { db, projects, cleanup } = setupTestApp();
    resetBroadcasts();
    const resumeOrder: string[] = [];
    try {
      const project = projects.createProject("Resume Success");
      const gates = createGateService(db, () => undefined, {
        onGateResolved: async () => {
          resumeOrder.push("resume");
        },
      });
      const gate = gates.createGate(project.id, "requirement_stuck");

      const resolved = await gates.resolveGate(gate.id, { decision: "keep_answering" });
      resumeOrder.push("returned");

      expect(resumeOrder).toEqual(["resume", "returned"]);
      expect(resolved.status).toBe("resolved");
      expect(resolved.decision).toBe("keep_answering");

      const projectEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all();
      expect(projectEvents.filter((event) => event.type === "human_gate.resolved")).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("waits beyond 10s when timeoutMs is 0", async () => {
    const { db, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Long Wait");
      const gates = createGateService(db, () => undefined);
      const gate = gates.createGate(project.id, "requirement_stuck");

      const waitPromise = gates.waitForGate(gate.id, { pollMs: 50, timeoutMs: 0 });

      setTimeout(() => {
        void gates.resolveGate(gate.id, { decision: "keep_answering" });
      }, 200);

      await expect(waitPromise).resolves.toBe("keep_answering");
    } finally {
      cleanup();
    }
  });

  it("is idempotent when resolving with the same decision twice", async () => {
    const { db, projects, cleanup } = setupTestApp();
    const resume = vi.fn();
    try {
      const project = projects.createProject("Idempotent");
      const gates = createGateService(db, () => undefined, {
        onGateResolved: resume,
      });
      const gate = gates.createGate(project.id, "requirement_stuck");

      await gates.resolveGate(gate.id, { decision: "keep_answering" });
      const again = await gates.resolveGate(gate.id, { decision: "keep_answering" });

      expect(again.decision).toBe("keep_answering");
      expect(resume).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });
});
