import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { deployments, projects } from "@oc/shared";
import { initRepo, ensureDevRepoScaffold } from "@oc/workspace";
import { writeMinimalProductWeb } from "@oc/workspace";
import {
  handleDeploymentGateDecision,
  startDeploymentPhase,
  submitDeploymentUrl,
} from "./engine.js";
import { createTestingDeps, seedTestingProject, setupTestDb } from "../test-utils.js";

function createDeploymentDeps(db: ReturnType<typeof setupTestDb>["db"], repoPath: string) {
  const base = createTestingDeps(db, repoPath);
  return {
    ...base,
    onDeploymentCompleted: () => undefined,
  };
}

describe("deployment engine", () => {
  it("creates deployment gate without exposing URL before approval", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-deploy-repo-"));
    initRepo(repoPath);
    const { projectId } = seedTestingProject(db, repoPath);
    db.update(projects).set({ status: "Deploying" }).where(eq(projects.id, projectId)).run();

    const deps = createDeploymentDeps(db, repoPath);
    try {
      const started = startDeploymentPhase(deps, { projectId });
      expect(started.phase).toBe("awaiting_gate");
      expect(started.deploymentUrl).toBeUndefined();
      expect(db.select().from(deployments).all()).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("stores deployment URL and moves to Awaiting Acceptance after approval", async () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-deploy-repo-"));
    initRepo(repoPath);
    const { projectId } = seedTestingProject(db, repoPath);
    db.update(projects).set({ status: "Deploying" }).where(eq(projects.id, projectId)).run();

    const deps = createDeploymentDeps(db, repoPath);
    try {
      startDeploymentPhase(deps, { projectId });
      submitDeploymentUrl(deps, {
        projectId,
        url: "https://demo.trycloudflare.com",
      });
      writeMinimalProductWeb(repoPath, "Deploy App");
      const result = await handleDeploymentGateDecision(deps, {
        projectId,
        decision: "approve",
      });
      expect(result.deploymentUrl).toBe("https://demo.trycloudflare.com");
      expect(deps.getProjectStatus(projectId)).toBe("Awaiting Acceptance");
      expect(db.select().from(deployments).all()[0]?.url).toBe("https://demo.trycloudflare.com");
    } finally {
      cleanup();
    }
  });

  it("reject resets deployment phase so start can reopen the gate", async () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-deploy-reject-"));
    initRepo(repoPath);
    const { projectId } = seedTestingProject(db, repoPath);
    db.update(projects).set({ status: "Deploying" }).where(eq(projects.id, projectId)).run();

    const deps = createDeploymentDeps(db, repoPath);
    try {
      startDeploymentPhase(deps, { projectId });
      submitDeploymentUrl(deps, {
        projectId,
        url: "https://demo.trycloudflare.com",
      });
      writeMinimalProductWeb(repoPath, "Reject App");
      const rejected = await handleDeploymentGateDecision(deps, {
        projectId,
        decision: "reject",
      });
      expect(rejected.phase).toBe("idle");
      expect(rejected.deploymentUrl).toBeUndefined();
      expect(deps.getProjectStatus(projectId)).toBe("Deploying");
      expect(db.select().from(deployments).all()).toHaveLength(0);

      const restarted = startDeploymentPhase(deps, { projectId });
      expect(restarted.phase).toBe("awaiting_gate");
      expect(restarted.gateId).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("blocks approval when repo still has scaffold placeholder UI", async () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-deploy-web-"));
    initRepo(repoPath);
    ensureDevRepoScaffold(repoPath);
    const { projectId } = seedTestingProject(db, repoPath);
    db.update(projects).set({ status: "Deploying" }).where(eq(projects.id, projectId)).run();

    const deps = createDeploymentDeps(db, repoPath);
    try {
      startDeploymentPhase(deps, { projectId });
      submitDeploymentUrl(deps, {
        projectId,
        url: "https://demo.trycloudflare.com",
      });
      await expect(
        handleDeploymentGateDecision(deps, {
          projectId,
          decision: "approve",
        }),
      ).rejects.toThrow(/Deployment blocked/i);
    } finally {
      cleanup();
    }
  });

  it("propagates onDeploymentCompleted failures", async () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-deploy-fail-"));
    initRepo(repoPath);
    const { projectId } = seedTestingProject(db, repoPath);
    db.update(projects).set({ status: "Deploying" }).where(eq(projects.id, projectId)).run();

    const deps = {
      ...createDeploymentDeps(db, repoPath),
      onDeploymentCompleted: async () => {
        throw new Error("delivery handoff failed");
      },
    };
    try {
      startDeploymentPhase(deps, { projectId });
      submitDeploymentUrl(deps, {
        projectId,
        url: "https://demo.trycloudflare.com",
      });
      writeMinimalProductWeb(repoPath, "Fail App");
      await expect(
        handleDeploymentGateDecision(deps, {
          projectId,
          decision: "approve",
        }),
      ).rejects.toThrow("delivery handoff failed");
    } finally {
      cleanup();
    }
  });
});
