import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  acceptanceCriteriaVersions,
  diffs,
  prdVersions,
  testResults,
} from "@oc/shared";
import { initRepo } from "@oc/workspace";
import { setupTestApp } from "../test-utils.js";

describe("panel API — M8", () => {
  it("GET /files?scope=all lists repo and artifacts paths", async () => {
    const { app, generatedProjectsRoot, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Files All" }),
      });
      const project = (await created.json()) as { id: string; slug: string };

      const repoPath = path.join(generatedProjectsRoot, project.slug, "repo");
      const artifactsPath = path.join(generatedProjectsRoot, project.slug, "artifacts");
      initRepo(repoPath);
      fs.writeFileSync(path.join(repoPath, "app.ts"), "export {};\n", "utf8");
      fs.writeFileSync(path.join(artifactsPath, "trace.zip"), "trace", "utf8");

      const response = await app.request(`/projects/${project.id}/files?scope=all`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { scope: string; files: string[] };
      expect(body.scope).toBe("all");
      expect(body.files).toContain("app.ts");
      expect(body.files).toContain("artifacts/trace.zip");
    } finally {
      cleanup();
    }
  });

  it("GET /diffs returns persisted diff rows", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Diffs Demo" }),
      });
      const project = (await created.json()) as { id: string };
      const now = new Date().toISOString();
      db.insert(diffs)
        .values({
          id: randomUUID(),
          project_id: project.id,
          diff_id: "diff-slice-1",
          summary: "1 file changed",
          path: "/tmp/repo",
          created_at: now,
        })
        .run();

      const response = await app.request(`/projects/${project.id}/diffs`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { diffs: Array<{ diffId: string }> };
      expect(body.diffs[0]?.diffId).toBe("diff-slice-1");
    } finally {
      cleanup();
    }
  });

  it("GET /tests/results partitions slice and final suites", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tests Demo" }),
      });
      const project = (await created.json()) as { id: string };
      const now = new Date().toISOString();
      db.insert(testResults)
        .values({
          id: randomUUID(),
          project_id: project.id,
          suite: "slice:auth",
          status: "passed",
          details: null,
          created_at: now,
        })
        .run();
      db.insert(testResults)
        .values({
          id: randomUUID(),
          project_id: project.id,
          suite: "final:vitest",
          status: "failed",
          details: "1 failed",
          created_at: now,
        })
        .run();

      const response = await app.request(`/projects/${project.id}/tests/results`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        slice: Array<{ suite: string }>;
        final: Array<{ suite: string }>;
      };
      expect(body.slice[0]?.suite).toBe("slice:auth");
      expect(body.final[0]?.suite).toBe("final:vitest");
    } finally {
      cleanup();
    }
  });

  it("GET /report returns PRD and empty delivery section", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Report Demo" }),
      });
      const project = (await created.json()) as { id: string };
      const now = new Date().toISOString();
      db.insert(prdVersions)
        .values({
          id: randomUUID(),
          project_id: project.id,
          version: "prd-1",
          content: "# Demo PRD",
          created_at: now,
        })
        .run();
      db.insert(acceptanceCriteriaVersions)
        .values({
          id: randomUUID(),
          project_id: project.id,
          version: "ac-1",
          content: "- Case 1",
          created_at: now,
        })
        .run();

      const response = await app.request(`/projects/${project.id}/report`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        sections: Array<{ id: string; content: string | null; emptyReason?: string }>;
      };
      const prd = body.sections.find((section) => section.id === "prd");
      const delivery = body.sections.find((section) => section.id === "delivery-report");
      expect(prd?.content).toContain("Demo PRD");
      expect(delivery?.content).toBeNull();
      expect(delivery?.emptyReason).toContain("not generated");
    } finally {
      cleanup();
    }
  });

  it("GET /preview/status returns unreachable when preview is absent", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Preview Demo" }),
      });
      const project = (await created.json()) as { id: string };

      const response = await app.request(`/projects/${project.id}/preview/status`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        previewUrl?: string;
        health: { reachable: boolean };
      };
      expect(body.previewUrl).toBeUndefined();
      expect(body.health.reachable).toBe(false);
    } finally {
      cleanup();
    }
  });
});
