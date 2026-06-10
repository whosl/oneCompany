import { eq } from "drizzle-orm";
import { humanGates } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

async function reachStuckGate(app: ReturnType<typeof setupTestApp>["app"], projectId: string) {
  await app.request(`/projects/${projectId}/requirement/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement: "模糊需求", profile: "stuck" }),
  });

  type RequirementResult = { phase: string; gateId?: string };

  let result = (await (
    await app.request(`/projects/${projectId}/requirement/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: ["a1"] }),
    })
  ).json()) as RequirementResult;

  if (result.phase === "awaiting_answers") {
    result = (await (
      await app.request(`/projects/${projectId}/requirement/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: ["a2"] }),
      })
    ).json()) as RequirementResult;
  }

  return result;
}

describe("gate resolve — stale session conflicts", () => {
  it("returns 409 when resume targets a missing workflow session", async () => {
    const { app, projects, gates, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Orphan Gate");
      const gate = gates.createGate(project.id, "requirement_stuck");

      const response = await app.request(`/gates/${gate.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "keep_answering" }),
      });

      expect(response.status).toBe(409);
      const body = (await response.json()) as { reason?: string };
      expect(body.reason).toBe("stale_gate");
    } finally {
      cleanup();
    }
  });

  it("returns 409 when resolving a gate whose workflow session has moved on", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Stale Gate");
      const stuck = await reachStuckGate(app, project.id);
      expect(stuck.phase).toBe("awaiting_gate");
      expect(stuck.gateId).toBeTruthy();
      const staleGateId = stuck.gateId!;

      const advance = await app.request(`/gates/${staleGateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "force_continue" }),
      });
      expect(advance.status).toBe(200);

      const staleResponse = await app.request(`/gates/${staleGateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "fail" }),
      });

      expect(staleResponse.status).toBe(409);
      const body = (await staleResponse.json()) as { reason?: string };
      expect(body.reason).toBe("gate_already_resolved");
    } finally {
      cleanup();
    }
  });

  it("returns 409 when resolving with a different decision after already resolved", async () => {
    const { app, projects, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Double Resolve");
      const stuck = await reachStuckGate(app, project.id);
      expect(stuck.gateId).toBeTruthy();

      const first = await app.request(`/gates/${stuck.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "force_continue" }),
      });
      expect(first.status).toBe(200);

      const second = await app.request(`/gates/${stuck.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "fail" }),
      });
      expect(second.status).toBe(409);

      const [row] = db.select().from(humanGates).where(eq(humanGates.id, stuck.gateId!)).all();
      expect(row?.decision).toBe("force_continue");
    } finally {
      cleanup();
    }
  });
});
