import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("requirement confirmation API — M11", () => {
  it("blocks development until requirement_confirm is approved", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Requirement Confirm");

      const started = await app.request(`/projects/${project.id}/requirement/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: "Build a complete todo app with local persistence and tests",
          profile: "complete",
        }),
      });
      expect(started.status).toBe(200);
      const requirement = (await started.json()) as {
        phase: string;
        projectStatus: string;
        gateId?: string;
        gateOptions?: string[];
      };
      expect(requirement.phase).toBe("awaiting_gate");
      expect(requirement.projectStatus).toBe("PRD Ready");
      expect(requirement.gateOptions).toContain("approve");

      const blocked = await app.request(`/projects/${project.id}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: "minimal" }),
      });
      expect(blocked.status).toBe(400);
      expect(await blocked.json()).toMatchObject({
        error: "Requirement confirmation gate must be approved before development",
      });

      const resolved = await app.request(`/gates/${requirement.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      expect(resolved.status).toBe(200);

      const development = await app.request(`/projects/${project.id}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: "minimal" }),
      });
      expect(development.status).toBe(200);
      const body = (await development.json()) as { gateType?: string };
      expect(body.gateType).toBe("tech_plan_confirm");
    } finally {
      cleanup();
    }
  });
});
