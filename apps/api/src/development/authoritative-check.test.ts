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

  it("parses large (chunked) vitest output instead of treating it as empty", async () => {
    const { db, projects, workspace, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Auth Check Chunk");
      const paths = workspace.ensureForProject(project);
      // Pad a valid success report past INLINE_OUTPUT_MAX_BYTES (8192) so persistOutput
      // spills it to a chunk file; the parser must read the file, not see "".
      const bigReport = JSON.stringify({
        numFailedTests: 0,
        numPassedTests: 3,
        success: true,
        testResults: Array.from({ length: 600 }, (_, i) => ({
          name: `test-${i}-${"x".repeat(20)}`,
        })),
      });
      expect(Buffer.byteLength(bigReport, "utf8")).toBeGreaterThan(8192);

      const shell = mockShell(db, project.id, paths.repo, bigReport);
      const runCheck = createRunAuthoritativeCheck(shell);
      const result = await runCheck(
        {
          id: "slice-1",
          title: "passing slice with large output",
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
