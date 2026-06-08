import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("projects list API — M9", () => {
  it("GET /projects returns all projects", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alpha" }),
      });
      await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Beta" }),
      });

      const response = await app.request("/projects");
      expect(response.status).toBe(200);
      const body = (await response.json()) as { projects: Array<{ name: string }> };
      expect(body.projects.length).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
    }
  });
});
