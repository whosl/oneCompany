import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("console API — M9", () => {
  it("GET /projects/:id/console/snapshot returns phase and events", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Console Snapshot" }),
      });
      const project = (await created.json()) as { id: string };

      await app.request(`/projects/${project.id}/requirement/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: "Build a todo app", profile: "happy_path" }),
      });

      const response = await app.request(`/projects/${project.id}/console/snapshot`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        project: { status: string };
        phase: { activeGroup: string };
        requirement?: { rawRequirement: string };
        events: unknown[];
      };
      expect(["Draft Requirement", "Asking Questions"]).toContain(body.project.status);
      expect(body.phase.activeGroup).toBe("Requirement Group");
      expect(body.requirement?.rawRequirement).toContain("todo");
      expect(Array.isArray(body.events)).toBe(true);
    } finally {
      cleanup();
    }
  });
});
