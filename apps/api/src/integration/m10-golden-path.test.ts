import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  acceptanceCriteriaVersions,
  deployments,
  prdVersions,
  projects,
} from "@oc/shared";
import { createDevSession, saveDevSession } from "@oc/workflow";
import { initRepo } from "@oc/workspace";
import { setupTestApp } from "../test-utils.js";

function seedTestingReadyProject(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
  repoPath: string,
): void {
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id: projectId,
      name: "M10 Golden Path",
      slug: `m10-${projectId.slice(0, 8)}`,
      status: "Testing",
      created_at: now,
      updated_at: now,
    })
    .run();
  db.insert(prdVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "prd-1",
      content: "# PRD\nTodo app",
      created_at: now,
    })
    .run();
  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "ac-1",
      content: "- Todo works",
      created_at: now,
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
          title: "Todo core",
          testCommand: "pnpm vitest run --reporter=json",
          status: "passed",
        },
      ],
    },
    meta: { ...payload.meta, phase: "completed" },
    testing: { phase: "idle", suiteResults: [] },
  });
}

describe("M10 golden path (stub engine)", () => {
  it("testing -> deployment gate -> final acceptance -> Delivered", async () => {
    process.env.OC_TESTING_FIXTURE = "1";
    const { app, db, generatedProjectsRoot, cleanup } = setupTestApp();
    try {
      const projectId = randomUUID();
      const repoPath = mkdtempSync(path.join(tmpdir(), "oc-m10-golden-"));
      initRepo(repoPath);
      seedTestingReadyProject(db, projectId, repoPath);

      const testing = await app.request(`/projects/${projectId}/testing/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestDeploy: true }),
      });
      expect(testing.status).toBe(200);

      const gatesAfterTesting = await app.request(`/projects/${projectId}/gates`);
      const gateList = (await gatesAfterTesting.json()) as {
        gates: Array<{ id: string; gateType: string }>;
      };
      const deploymentGate = gateList.gates.find((gate) => gate.gateType === "deployment");
      expect(deploymentGate).toBeTruthy();

      await app.request(`/projects/${projectId}/deployment/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://m10.trycloudflare.com" }),
      });

      await app.request(`/gates/${deploymentGate!.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });

      expect(db.select().from(deployments).all()[0]?.url).toBe("https://m10.trycloudflare.com");

      const gatesAfterDeploy = await app.request(`/projects/${projectId}/gates`);
      const finalGateList = (await gatesAfterDeploy.json()) as {
        gates: Array<{ id: string; gateType: string }>;
      };
      const finalGate = finalGateList.gates.find((gate) => gate.gateType === "final_acceptance");
      expect(finalGate).toBeTruthy();

      const report = await app.request(`/projects/${projectId}/report`);
      const reportBody = (await report.json()) as {
        sections: Array<{ id: string; content: string | null }>;
      };
      const deliverySection = reportBody.sections.find((section) => section.id === "delivery-report");
      expect(deliverySection?.content).toBeTruthy();

      await app.request(`/gates/${finalGate!.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "accept" }),
      });

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .all()[0];
      expect(project?.status).toBe("Delivered");

      const slug = project?.slug;
      const reportPath = path.join(
        generatedProjectsRoot,
        slug!,
        "artifacts",
        "delivery-report.md",
      );
      const fs = await import("node:fs");
      expect(fs.existsSync(reportPath)).toBe(true);
    } finally {
      delete process.env.OC_TESTING_FIXTURE;
      cleanup();
    }
  });
});
