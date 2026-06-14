import { eq } from "drizzle-orm";
import { events, humanGates } from "@oc/shared";
import { describe, expect, it, vi } from "vitest";
import { resetBroadcasts } from "../events/broadcast.js";
import { setupTestApp } from "../test-utils.js";
import { createGateResumeHandler } from "./resume.js";
import { createGateService } from "./service.js";

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
      const gate = gates.createGate(project.id, "dangerous_operation", { riskLevel: "high" });

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
    const { db, projects, cleanup } = setupTestApp();
    resetBroadcasts();
    try {
      const project = projects.createProject("Wait Demo");
      const gates = createGateService(db, () => undefined);
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

  it("coding_question gate resolves end-to-end without invoking the resume handler", async () => {
    // Regression for the P1 stuck-gate bug: coding_question is self-resolving,
    // so the resume handler (createGateResumeHandler) must skip it entirely;
    // resolveGate persists the decision and waitForGate observes it. If the
    // resume handler fired, it would re-enter the dev workflow and throw on a
    // phase mismatch, leaving the gate open and the waiter blocked forever.
    const { db, projects, cleanup } = setupTestApp();
    resetBroadcasts();
    try {
      const project = projects.createProject("Coding Q");
      // Wire the REAL resume handler with a spy standing in for the dev service.
      // createGateResumeHandler skips coding_question before delegating, so the
      // spy must never be called for this gate type.
      const developmentResumeSpy = vi.fn().mockResolvedValue(undefined);
      const resumeHandler = createGateResumeHandler({
        development: { resumeAfterGate: developmentResumeSpy } as never,
      });
      const gates = createGateService(db, () => undefined, {
        onGateResolved: resumeHandler,
      });
      const gate = gates.createGate(project.id, "coding_question", {
        caller: "opencode",
        operation: "用 React 还是 Vue？",
      });

      // A blocking waiter (as runSlice would hold) starts before the answer.
      const waitPromise = gates.waitForGate(gate.id, { pollMs: 20, timeoutMs: 2000 });

      // Human answers via the API.
      const decision = await gates.resolveGate(gate.id, {
        decision: "answer",
        customText: "用 React",
      });

      // The persisted decision carries the free-text answer.
      expect(decision.decision).toBe("answer:用 React");
      // waitForGate unblocks and returns the same decision string.
      await expect(waitPromise).resolves.toBe("answer:用 React");

      // The row is marked resolved in the DB.
      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("resolved");

      // CRITICAL: the dev resume handler must NOT have been called for coding_question.
      expect(developmentResumeSpy).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("coding_question skip decision resolves to a skip verdict", async () => {
    const { db, projects, cleanup } = setupTestApp();
    resetBroadcasts();
    try {
      const project = projects.createProject("Coding Q Skip");
      const gates = createGateService(db, () => undefined);
      const gate = gates.createGate(project.id, "coding_question", {
        caller: "opencode",
        operation: "要不要支持暗色模式？",
      });

      const waitPromise = gates.waitForGate(gate.id, { pollMs: 20, timeoutMs: 2000 });
      await gates.resolveGate(gate.id, { decision: "skip" });
      await expect(waitPromise).resolves.toBe("skip");
    } finally {
      cleanup();
    }
  });
});
