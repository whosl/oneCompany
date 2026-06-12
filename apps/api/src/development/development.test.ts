import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDevSession, saveDevSession } from "@oc/workflow";
import {
  acceptanceCriteriaVersions,
  prdVersions,
  projects as projectsTable,
} from "@oc/shared";
import { setupTestApp } from "../test-utils.js";

function seedPrdReady(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
): void {
  const now = new Date().toISOString();
  db.insert(projectsTable)
    .values({
      id: projectId,
      name: "Dev API Project",
      slug: `dev-api-${projectId.slice(0, 8)}`,
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

describe("development API — M6", () => {
  it("POST /projects/:id/development/start requires PRD Ready project", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      seedPrdReady(db, projectId);

      const response = await app.request(`/projects/${projectId}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: "minimal" }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        projectStatus: string;
        gateType?: string;
        phase: string;
      };
      expect(body.projectStatus).toBe("Tech Plan Review");
      expect(body.gateType).toBe("tech_plan_confirm");
      expect(body.phase).toBe("awaiting_gate");
    } finally {
      cleanup();
    }
  });

  it("GET /projects/:id/development/status returns session summary", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      seedPrdReady(db, projectId);

      await app.request(`/projects/${projectId}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await app.request(`/projects/${projectId}/development/status`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { phase: string; state: { taskQueue: unknown[] } };
      expect(body.phase).toBe("awaiting_gate");
      expect(body.state.taskQueue).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("POST /projects/:id/development/start on Developing returns 202 for background slice loop", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      seedPrdReady(db, projectId);
      const repoPath = `/tmp/dev-resume-${projectId.slice(0, 8)}`;
      let payload = createDevSession(db, projectId, repoPath, "minimal");
      payload = {
        ...payload,
        meta: { ...payload.meta, phase: "slicing" },
        state: {
          ...payload.state,
          taskQueue: [
            {
              id: "slice-1",
              title: "One",
              testCommand: "pnpm vitest run tests/a.test.ts --reporter=json",
              status: "pending",
            },
          ],
        },
      };
      saveDevSession(db, projectId, payload);
      const now = new Date().toISOString();
      db.update(projectsTable)
        .set({ status: "Developing", updated_at: now })
        .where(eq(projectsTable.id, projectId))
        .run();

      const response = await app.request(`/projects/${projectId}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(202);
      const body = (await response.json()) as { running?: boolean; phase: string };
      expect(body.running).toBe(true);
      expect(body.phase).toBe("slicing");
    } finally {
      cleanup();
    }
  });
});
