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
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-shell-"));
  const workspace = createWorkspace({
    projectId,
    slug: "shell-demo",
    rootDir: path.join(rootDir, "shell-demo"),
  });

  const gates: Array<{ id: string; type: string }> = [];

  const base: ShellDeps = {
    db,
    projectId: workspace.meta.projectId,
    repoPath: workspace.repo,
    logsPath: workspace.logs,
    createGate: (_projectId, gateType) => {
      const gate = { id: randomUUID(), projectId: workspace.meta.projectId, gateType };
      gates.push({ id: gate.id, type: gateType });
      return gate;
    },
    waitForGate: async () => "approve",
    runLocal: async (cmd) => ({
      exitCode: 0,
      stdout: `ran:${cmd}`,
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

describe("shell executor — M5", () => {
  it("runs low-risk commands locally", async () => {
    const { deps, cleanup } = makeDeps();
    const runLocal = vi.fn(deps.runLocal);
    deps.runLocal = runLocal;

    const result = await runCommand(deps, {
      projectId: deps.projectId,
      cmd: "git status",
    });

    expect(result.exitCode).toBe(0);
    expect(runLocal).toHaveBeenCalledOnce();
    expect(result.gated).toBeFalsy();
    cleanup();
  });

  it("requires gate approval before high-risk commands run", async () => {
    const runSandbox = vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" }));
    const { deps, cleanup } = makeDeps({
      waitForGate: async () => "reject",
      runSandbox,
    });

    await expect(
      runCommand(deps, {
        projectId: deps.projectId,
        cmd: "npm install lodash",
      }),
    ).rejects.toBeInstanceOf(CommandRejectedError);
    expect(runSandbox).not.toHaveBeenCalled();
    cleanup();
  });

  it("runs high-risk commands in sandbox after approval", async () => {
    const runSandbox = vi.fn(async () => ({ exitCode: 0, stdout: "sandboxed", stderr: "" }));
    const { deps, cleanup } = makeDeps({ runSandbox });

    const result = await runCommand(deps, {
      projectId: deps.projectId,
      cmd: "npm install lodash",
    });

    expect(result.gated).toBe(true);
    expect(runSandbox).toHaveBeenCalledOnce();
    cleanup();
  });

  it("routes deploy commands through deployment gate and local runner", async () => {
    const createGate = vi.fn((projectId, gateType) => ({
      id: randomUUID(),
      projectId,
      gateType,
    }));
    const runLocal = vi.fn(async () => ({ exitCode: 0, stdout: "deployed", stderr: "" }));
    const { deps, cleanup } = makeDeps({ createGate, runLocal });

    await runCommand(deps, {
      projectId: deps.projectId,
      cmd: "vercel deploy",
    });

    expect(createGate).toHaveBeenCalledWith(deps.projectId, "deployment", undefined);
    expect(runLocal).toHaveBeenCalledOnce();
    cleanup();
  });
});
