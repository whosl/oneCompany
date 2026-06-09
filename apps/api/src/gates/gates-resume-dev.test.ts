import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  acceptanceCriteriaVersions,
  prdVersions,
  projects,
} from "@oc/shared";
import { setupTestApp } from "../test-utils.js";

function seedPrdReady(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
): void {
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id: projectId,
      name: "Gate Resume Dev",
      slug: `gate-dev-${projectId.slice(0, 8)}`,
      status: "PRD Ready",
      created_at: now,
      updated_at: now,
    })
    .run();
  db.insert(prdVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "prd-1",
      content: "# PRD",
      created_at: now,
    })
    .run();
  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "ac-1",
      content: "- criterion",
      created_at: now,
    })
    .run();
}

describe("gate resume — development", () => {
  it("resolves tech_plan_confirm and continues development workflow", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      seedPrdReady(db, projectId);

      const started = await app.request(`/projects/${projectId}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const startBody = (await started.json()) as { gateId?: string };
      expect(startBody.gateId).toBeTruthy();

      const resolved = await app.request(`/gates/${startBody.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      expect(resolved.status).toBe(200);

      let statusBody = {
        projectStatus: "",
        state: { taskQueue: [] as Array<{ testCommand: string }> },
      };
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const status = await app.request(`/projects/${projectId}/development/status`);
        statusBody = (await status.json()) as typeof statusBody;
        if (statusBody.state.taskQueue.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(statusBody.state.taskQueue.length).toBeGreaterThan(0);
      expect(statusBody.state.taskQueue[0]?.testCommand).toBeTruthy();
      expect(["Developing", "Testing"]).toContain(statusBody.projectStatus);
    } finally {
      cleanup();
    }
  });
});
