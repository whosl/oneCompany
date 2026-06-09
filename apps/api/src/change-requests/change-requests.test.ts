import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptanceCriteriaVersions,
  changeRequests,
  prdVersions,
  projects,
} from "@oc/shared";
import { createDevSession, saveDevSession } from "@oc/workflow";
import { initRepo } from "@oc/workspace";
import { setupTestApp } from "../test-utils.js";

function seedDevelopingProject(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
  repoPath: string,
): void {
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id: projectId,
      name: "API Change Request",
      slug: `api-change-${projectId.slice(0, 8)}`,
      status: "Developing",
      created_at: now,
      updated_at: now,
    })
    .run();
  db.insert(prdVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "prd-1",
      content: "# PRD\nInitial",
      created_at: now,
    })
    .run();
  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "ac-1",
      content: "- Feature A",
      created_at: now,
    })
    .run();

  const payload = createDevSession(db, projectId, repoPath, "testing_pass");
  saveDevSession(db, projectId, {
    ...payload,
    meta: { ...payload.meta, phase: "slicing" },
  });
}

describe("change requests API", () => {
  it("creates requirement change and opens Change Review gate", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      const repoPath = mkdtempSync(path.join(tmpdir(), "oc-api-change-"));
      initRepo(repoPath);
      seedDevelopingProject(db, projectId, repoPath);

      const response = await app.request(`/projects/${projectId}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "Add export to CSV",
          kind: "requirement_change",
        }),
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as { changeRequestId: string; gateId?: string };
      expect(body.changeRequestId).toBeTruthy();
      expect(body.gateId).toBeTruthy();

      const row = db.select().from(changeRequests).all()[0];
      expect(row?.kind).toBe("requirement_change");
    } finally {
      cleanup();
    }
  });
});
