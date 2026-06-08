import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("projects pause/resume API — M9", () => {
  it("POST pause and resume round-trips status", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pause Demo" }),
      });
      const project = (await created.json()) as { id: string; status: string };

      const pauseResponse = await app.request(`/projects/${project.id}/pause`, { method: "POST" });
      expect(pauseResponse.status).toBe(200);
      const paused = (await pauseResponse.json()) as { status: string };
      expect(paused.status).toBe("Paused");

      const resumeResponse = await app.request(`/projects/${project.id}/resume`, {
        method: "POST",
      });
      expect(resumeResponse.status).toBe(200);
      const resumed = (await resumeResponse.json()) as { status: string };
      expect(resumed.status).toBe(project.status);
    } finally {
      cleanup();
    }
  });
});
