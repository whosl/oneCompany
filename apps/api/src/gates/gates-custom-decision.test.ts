import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("gate custom decisions — M13 F-03", () => {
  it("requirement_confirm custom advances workflow and records note", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Custom PRD");

      const started = await app.request(`/projects/${project.id}/requirement/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: "Build a complete todo app with local persistence and tests",
          profile: "complete",
        }),
      });
      expect(started.status).toBe(200);
      const waiting = (await started.json()) as {
        phase: string;
        gateId?: string;
      };
      expect(waiting.phase).toBe("awaiting_gate");
      expect(waiting.gateId).toBeTruthy();

      const response = await app.request(`/gates/${waiting.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "custom",
          customText: "ship with known gaps",
        }),
      });
      expect(response.status).toBe(200);

      const snapshot = (await (
        await app.request(`/projects/${project.id}/console/snapshot`)
      ).json()) as { risks?: string[] };

      expect(
        snapshot.risks?.some((risk) => risk.includes("ship with known gaps")),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });
});
