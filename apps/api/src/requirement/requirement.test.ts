import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("requirement API — M3", () => {
  it("POST /projects/:id/requirement/start returns awaiting_answers for vague input", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "M3 API" }),
      });
      const project = (await created.json()) as { id: string };

      const response = await app.request(`/projects/${project.id}/requirement/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: "做一个 todo 应用",
          profile: "vague",
        }),
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        phase: string;
        questions?: string[];
      };
      expect(result.phase).toBe("awaiting_answers");
      expect(result.questions?.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("POST /projects/:id/requirement/answers triggers re-score", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "M3 Answers" }),
      });
      const project = (await created.json()) as { id: string };

      await app.request(`/projects/${project.id}/requirement/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: "做一个应用",
          profile: "improving",
        }),
      });

      const response = await app.request(`/projects/${project.id}/requirement/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: ["个人用户", "需要任务管理"] }),
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as { state: { questionRounds: Array<{ answers: string[] }> } };
      expect(result.state.questionRounds[0]?.answers).toEqual([
        "个人用户",
        "需要任务管理",
      ]);
    } finally {
      cleanup();
    }
  });

  it("POST /projects/:id/requirement/skip uses defaults and reaches PRD Ready", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "M3 Skip" }),
      });
      const project = (await created.json()) as { id: string };

      await app.request(`/projects/${project.id}/requirement/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: "做一个 todo 应用",
          profile: "vague",
        }),
      });

      const response = await app.request(`/projects/${project.id}/requirement/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        phase: string;
        projectStatus: string;
        state: { clarificationSkipped: boolean; assumptions: string[] };
      };
      expect(result.phase).toBe("awaiting_gate");
      expect(result.projectStatus).toBe("PRD Ready");
      expect(result.state.clarificationSkipped).toBe(true);
      expect(result.state.assumptions.some((item) => item.includes("跳过澄清"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
