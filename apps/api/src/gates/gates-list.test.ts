import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("project gates list — M4", () => {
  it("GET /projects/:id/gates returns only open gates", async () => {
    const { app, projects, gates, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Gate List");
      const openGate = gates.createGate(project.id, "requirement_stuck");
      const resolvedGate = gates.createGate(project.id, "requirement_confirm");
      await gates.resolveGate(resolvedGate.id, { decision: "approve" });

      const response = await app.request(`/projects/${project.id}/gates`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        gates: Array<{ id: string; status: string }>;
      };
      expect(body.gates).toHaveLength(1);
      expect(body.gates[0]?.id).toBe(openGate.id);
      expect(body.gates[0]?.status).toBe("open");
    } finally {
      cleanup();
    }
  });
});
