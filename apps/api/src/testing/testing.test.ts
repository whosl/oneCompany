import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDevSession, saveDevSession } from "@oc/workflow";
import { initRepo } from "@oc/workspace";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { projects } from "@oc/shared";
import { setupTestApp } from "../test-utils.js";

function seedTestingSession(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
  repoPath: string,
): void {
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id: projectId,
      name: "API Testing",
      slug: `api-test-${projectId.slice(0, 8)}`,
      status: "Testing",
      created_at: now,
      updated_at: now,
    })
    .run();

  const payload = createDevSession(db, projectId, repoPath, "testing_pass");
  saveDevSession(db, projectId, {
    ...payload,
    state: {
      ...payload.state,
      techPlanVersion: "tp-1",
      taskQueue: [
        {
          id: "slice-1",
          title: "Done",
          testCommand: "pnpm vitest run --reporter=json",
          status: "passed",
        },
      ],
    },
    meta: { ...payload.meta, phase: "completed" },
    testing: { phase: "idle", suiteResults: [] },
  });
}

describe("testing API — M7", () => {
  it("POST preview/start returns reachable URL", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      const repoPath = mkdtempSync(path.join(tmpdir(), "oc-api-testing-"));
      initRepo(repoPath);
      seedTestingSession(db, projectId, repoPath);

      const response = await app.request(`/projects/${projectId}/preview/start`, {
        method: "POST",
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { url: string; health: { reachable: boolean } };
      expect(body.url).toBe(`/preview/${encodeURIComponent(projectId)}/`);
      expect(body.health.reachable).toBe(true);

      const proxied = await app.request(body.url);
      expect(proxied.status).toBe(200);
      expect(await proxied.text()).toContain("generated-app");
    } finally {
      cleanup();
    }
  });

  it("POST preview/stop clears stored previewUrl", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      const repoPath = mkdtempSync(path.join(tmpdir(), "oc-api-testing-"));
      initRepo(repoPath);
      seedTestingSession(db, projectId, repoPath);

      const start = await app.request(`/projects/${projectId}/preview/start`, {
        method: "POST",
      });
      expect(start.status).toBe(200);
      const started = (await start.json()) as { url: string };

      const stop = await app.request(`/projects/${projectId}/preview/stop`, {
        method: "POST",
      });
      expect(stop.status).toBe(200);

      const status = await app.request(`/projects/${projectId}/preview/status`);
      expect(status.status).toBe(200);
      const statusBody = (await status.json()) as {
        previewUrl?: string;
        health: { reachable: boolean };
      };
      expect(statusBody.previewUrl).toBeUndefined();
      expect(statusBody.health.reachable).toBe(false);

      const snapshot = await app.request(`/projects/${projectId}/console/snapshot`);
      const snapshotBody = (await snapshot.json()) as {
        dev?: { previewUrl?: string };
        testing?: { previewUrl?: string };
      };
      expect(snapshotBody.dev?.previewUrl).toBeUndefined();
      expect(snapshotBody.testing?.previewUrl).toBeUndefined();
      expect(started.url).toBe(`/preview/${encodeURIComponent(projectId)}/`);
    } finally {
      cleanup();
    }
  });

  it("GET testing/status returns session summary", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      const repoPath = mkdtempSync(path.join(tmpdir(), "oc-api-testing-"));
      initRepo(repoPath);
      seedTestingSession(db, projectId, repoPath);

      const response = await app.request(`/projects/${projectId}/testing/status`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { phase: string; projectStatus: string };
      expect(body.projectStatus).toBe("Testing");
      expect(body.phase).toBe("idle");
    } finally {
      cleanup();
    }
  });

  it("POST testing/start runs phase and returns suite results", async () => {
    process.env.OC_TESTING_FIXTURE = "1";
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      const repoPath = mkdtempSync(path.join(tmpdir(), "oc-api-testing-"));
      initRepo(repoPath);
      seedTestingSession(db, projectId, repoPath);

      const response = await app.request(`/projects/${projectId}/testing/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        suiteResults: Array<{ suite: string }>;
        projectStatus: string;
      };
      expect(body.suiteResults.length).toBeGreaterThan(0);
      expect(body.projectStatus).toBe("Awaiting Acceptance");
      expect(body.suiteResults).toHaveLength(4);
    } finally {
      delete process.env.OC_TESTING_FIXTURE;
      cleanup();
    }
  });
});
