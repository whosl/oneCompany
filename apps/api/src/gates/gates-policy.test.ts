import { eq } from "drizzle-orm";
import { humanGates } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("gate policy enforcement — M4", () => {
  it("rejects skip_risk_and_continue on deployment gates", async () => {
    const { app, projects, gates, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Deployment Gate");
      const gate = gates.createGate(project.id, "deployment");

      const response = await app.request(`/gates/${gate.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "skip_risk_and_continue" }),
      });

      expect(response.status).toBe(400);
      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("open");
    } finally {
      cleanup();
    }
  });

  it("accepts force_continue on requirement_stuck gates", async () => {
    const { app, projects, gates, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Stuck Gate");
      const gate = gates.createGate(project.id, "requirement_stuck");

      const response = await app.request(`/gates/${gate.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "force_continue" }),
      });

      expect(response.status).toBe(200);
    } finally {
      cleanup();
    }
  });

  it("rejects skip_risk_and_continue on high-risk dangerous_operation gates", async () => {
    const { app, projects, gates, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Danger Gate");
      const gate = gates.createGate(project.id, "dangerous_operation", { riskLevel: "high" });

      const response = await app.request(`/gates/${gate.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "skip_risk_and_continue" }),
      });

      expect(response.status).toBe(400);
      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gate.id)).all();
      expect(row?.status).toBe("open");
    } finally {
      cleanup();
    }
  });
});
