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

describe("gate resolve resumes workflow — M4", () => {
  it("resolving requirement_stuck continues to PRD Ready", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Resume Demo");
      const stuck = await reachStuckGate(app, project.id);
      expect(stuck.phase).toBe("awaiting_gate");
      expect(stuck.gateId).toBeTruthy();

      const response = await app.request(`/gates/${stuck.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "force_continue" }),
      });
      expect(response.status).toBe(200);

      const projectResponse = await app.request(`/projects/${project.id}`);
      const updated = (await projectResponse.json()) as { status: string };
      expect(updated.status).toBe("PRD Ready");
    } finally {
      cleanup();
    }
  });
});
