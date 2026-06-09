import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Db } from "@oc/shared";
import type { ShellDeps } from "@oc/workspace";
import { setupTestApp } from "../test-utils.js";
import { createRunAuthoritativeCheck } from "./authoritative-check.js";

function mockShell(db: Db, projectId: string, repoPath: string, stdout: string): ShellDeps {
  return {
    db,
    projectId,
    repoPath,
    logsPath: repoPath,
    createGate: (pid, gateType) => ({
      id: randomUUID(),
      projectId: pid,
      gateType,
    }),
    waitForGate: async () => "approve",
    runLocal: async () => ({ exitCode: 0, stdout, stderr: "" }),
    runSandbox: async () => ({ exitCode: 0, stdout, stderr: "" }),
    isDockerAvailable: () => false,
  };
}

describe("authoritative check — M9.5", () => {
  it("returns failed when scoped vitest json reports failures", async () => {
    const { db, projects, workspace, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Auth Check Fail");
      const paths = workspace.ensureForProject(project);
      const shell = mockShell(
        db,
        project.id,
        paths.repo,
        JSON.stringify({ numFailedTests: 2, numPassedTests: 0, success: false }),
      );
      const runCheck = createRunAuthoritativeCheck(shell);
      const result = await runCheck(
        {
          id: "slice-1",
          title: "failing slice",
          testCommand: "git status",
          status: "pending",
        },
        1,
      );

      expect(result.passed).toBe(false);
      expect(result.details).toContain("attempt 1");
    } finally {
      cleanup();
    }
  });

  it("returns passed when scoped vitest json reports success", async () => {
    const { db, projects, workspace, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Auth Check Pass");
      const paths = workspace.ensureForProject(project);
      const shell = mockShell(
        db,
        project.id,
        paths.repo,
        JSON.stringify({ numFailedTests: 0, numPassedTests: 3, success: true }),
      );
      const runCheck = createRunAuthoritativeCheck(shell);
      const result = await runCheck(
        {
          id: "slice-1",
          title: "passing slice",
          testCommand: "git status",
          status: "pending",
        },
        1,
      );

      expect(result.passed).toBe(true);
    } finally {
      cleanup();
    }
  });
});
