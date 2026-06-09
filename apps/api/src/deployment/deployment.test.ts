import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDevSession, saveDevSession } from "@oc/workflow";
import { deployments, projects } from "@oc/shared";
import { initRepo } from "@oc/workspace";
import { setupTestApp } from "../test-utils.js";

function seedDeployingProject(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
  repoPath: string,
): void {
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id: projectId,
      name: "API Deployment",
      slug: `api-deploy-${projectId.slice(0, 8)}`,
      status: "Deploying",
      created_at: now,
      updated_at: now,
    })
    .run();

  const payload = createDevSession(db, projectId, repoPath, "testing_pass");
  saveDevSession(db, projectId, {
    ...payload,
    meta: { ...payload.meta, phase: "completed" },
  });
}

describe("deployment API", () => {
  it("does not expose deployment URL before gate approval", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      const repoPath = mkdtempSync(path.join(tmpdir(), "oc-api-deploy-"));
      initRepo(repoPath);
      seedDeployingProject(db, projectId, repoPath);

      const start = await app.request(`/projects/${projectId}/deployment/start`, { method: "POST" });
      expect(start.status).toBe(200);

      const reportBefore = await app.request(`/projects/${projectId}/report`);
      const reportBody = (await reportBefore.json()) as { deploymentUrl?: string };
      expect(reportBody.deploymentUrl).toBeUndefined();

      const urlRes = await app.request(`/projects/${projectId}/deployment/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://demo.trycloudflare.com" }),
      });
      expect(urlRes.status).toBe(200);

      const gates = await app.request(`/projects/${projectId}/gates`);
      const gateBody = (await gates.json()) as {
        gates: Array<{ id: string; gateType: string; status: string }>;
      };
      const deploymentGate = gateBody.gates.find((gate) => gate.gateType === "deployment");
      expect(deploymentGate).toBeTruthy();

      const resolve = await app.request(`/gates/${deploymentGate!.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      expect(resolve.status).toBe(200);

      const rows = db.select().from(deployments).all();
      expect(rows[0]?.url).toBe("https://demo.trycloudflare.com");

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .all()[0];
      expect(project?.status).toBe("Awaiting Acceptance");
    } finally {
      cleanup();
    }
  });
});
