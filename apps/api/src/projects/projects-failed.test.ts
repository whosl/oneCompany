import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

async function reachRequirementStuckGate(
  app: ReturnType<typeof setupTestApp>["app"],
  projectId: string,
): Promise<string> {
  const started = await app.request(`/projects/${projectId}/requirement/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement: "模糊需求", profile: "stuck" }),
  });
  expect(started.status).toBe(200);
  let body = (await started.json()) as { phase: string; gateId?: string };

  for (let round = 0; round < 3 && body.phase === "awaiting_answers"; round += 1) {
    const answers = await app.request(`/projects/${projectId}/requirement/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [`answer ${round + 1}`] }),
    });
    expect(answers.status).toBe(200);
    body = (await answers.json()) as { phase: string; gateId?: string };
  }

  expect(body.phase).toBe("awaiting_gate");
  expect(body.gateId).toBeTruthy();
  return body.gateId!;
}

describe("projects Failed reachability — M11", () => {
  it("requirement_stuck fail moves project to Failed", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Failed Requirement" }),
      });
      const project = (await created.json()) as { id: string };
      const gateId = await reachRequirementStuckGate(app, project.id);

      const resolved = await app.request(`/gates/${gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "fail" }),
      });
      expect(resolved.status).toBe(200);

      const status = await app.request(`/projects/${project.id}`);
      const body = (await status.json()) as { status: string };
      expect(body.status).toBe("Failed");
    } finally {
      cleanup();
    }
  });

  it("rejects illegal Developing to Delivered transition", () => {
    const { projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Illegal Transition");
      projects.setStatus(project.id, "PRD Ready", "test.setup");
      projects.setStatus(project.id, "Tech Plan Review", "test.setup");
      projects.setStatus(project.id, "Developing", "test.setup");
      expect(() => projects.setStatus(project.id, "Delivered", "test.illegal")).toThrow();
    } finally {
      cleanup();
    }
  });

});
