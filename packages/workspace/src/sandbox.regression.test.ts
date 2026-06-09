import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CommandRejectedError, runCommand, type ShellDeps } from "./shell.js";
import { seedProject, setupTestDb } from "./test-utils.js";
import { createWorkspace } from "./workspace.js";

function makeDeps(overrides: Partial<ShellDeps> = {}): { deps: ShellDeps; cleanup: () => void } {
  const { db, cleanup } = setupTestDb();
  const projectId = seedProject(db);
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-sandbox-reg-"));
  const workspace = createWorkspace({
    projectId,
    slug: "sandbox-reg",
    rootDir: path.join(rootDir, "sandbox-reg"),
  });

  const base: ShellDeps = {
    db,
    projectId: workspace.meta.projectId,
    repoPath: workspace.repo,
    logsPath: workspace.logs,
    createGate: (_projectId, gateType) => ({
      id: randomUUID(),
      projectId: workspace.meta.projectId,
      gateType,
    }),
    waitForGate: async () => "approve",
    runLocal: async (cmd) => ({
      exitCode: 0,
      stdout: `local:${cmd}`,
      stderr: "",
    }),
    runSandbox: async (cmd) => ({
      exitCode: 0,
      stdout: `sandbox:${cmd}`,
      stderr: "",
    }),
    isDockerAvailable: () => true,
  };

  return { deps: { ...base, ...overrides }, cleanup };
}

describe("sandbox regression — M11 §12", () => {
  it("runs low-risk commands locally without a gate", async () => {
    const runLocal = vi.fn(async (cmd: string) => ({ exitCode: 0, stdout: cmd, stderr: "" }));
    const runSandbox = vi.fn();
    const { deps, cleanup } = makeDeps({ runLocal, runSandbox });

    await runCommand(deps, { projectId: deps.projectId, cmd: "echo hello" });

    expect(runLocal).toHaveBeenCalledOnce();
    expect(runSandbox).not.toHaveBeenCalled();
    cleanup();
  });

  it("runs approved high-risk commands in sandbox", async () => {
    const runLocal = vi.fn();
    const runSandbox = vi.fn(async (cmd: string) => ({ exitCode: 0, stdout: cmd, stderr: "" }));
    const { deps, cleanup } = makeDeps({ runLocal, runSandbox });

    await runCommand(deps, { projectId: deps.projectId, cmd: "npm install lodash" });

    expect(runSandbox).toHaveBeenCalledOnce();
    expect(runLocal).not.toHaveBeenCalled();
    cleanup();
  });

  it("runs approved deploy commands locally", async () => {
    const runLocal = vi.fn(async (cmd: string) => ({ exitCode: 0, stdout: cmd, stderr: "" }));
    const runSandbox = vi.fn();
    const { deps, cleanup } = makeDeps({ runLocal, runSandbox });

    await runCommand(deps, { projectId: deps.projectId, cmd: "cloudflared tunnel run" });

    expect(runLocal).toHaveBeenCalledOnce();
    expect(runSandbox).not.toHaveBeenCalled();
    cleanup();
  });

  it("rejects high-risk commands when the gate is denied", async () => {
    const runSandbox = vi.fn();
    const { deps, cleanup } = makeDeps({
      waitForGate: async () => "reject",
      runSandbox,
    });

    await expect(
      runCommand(deps, { projectId: deps.projectId, cmd: "rm -rf node_modules" }),
    ).rejects.toBeInstanceOf(CommandRejectedError);
    expect(runSandbox).not.toHaveBeenCalled();
    cleanup();
  });
});
