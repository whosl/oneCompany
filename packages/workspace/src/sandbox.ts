import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { runLocalCommand } from "./local-exec.js";
import type { ExecResult } from "./shell.js";

const execFileAsync = promisify(execFile);

/**
 * OS-native sandbox for approved high-risk commands, aligned with how Codex
 * CLI and Claude Code handle them: run on the HOST toolchain (node/pnpm work,
 * paths unchanged) inside a macOS Seatbelt profile that restricts file writes
 * to the project repo + tmp and denies network access.
 *
 * The human dangerous_operation gate remains the primary control — the
 * sandbox is defense-in-depth. When no sandbox primitive is available
 * (non-macOS without an equivalent), the command falls back to plain local
 * execution after the explicit human approval.
 */

const SANDBOX_EXEC_BIN = "/usr/bin/sandbox-exec";

/** Kept for backwards compatibility with older callers/tests. */
export class DockerUnavailableError extends Error {
  constructor(message = "Docker is not available for sandbox execution") {
    super(message);
    this.name = "DockerUnavailableError";
  }
}

/** Legacy export — no longer gates sandbox execution. */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"], {
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

export function isSeatbeltAvailable(): boolean {
  return process.platform === "darwin" && fs.existsSync(SANDBOX_EXEC_BIN);
}

function seatbeltQuote(p: string): string {
  return `"${p.replace(/(["\\])/g, "\\$1")}"`;
}

/**
 * Seatbelt profile: allow everything except network and file writes; writes
 * are re-allowed only under the project repo, tmp locations, and /dev (for
 * /dev/null etc.). Mirrors the policy Codex CLI uses on macOS.
 */
export function buildSeatbeltProfile(projectPath: string): string {
  const resolved = fs.existsSync(projectPath) ? fs.realpathSync(projectPath) : projectPath;
  const writable = [
    resolved,
    "/private/tmp",
    "/private/var/tmp",
    "/private/var/folders",
    os.tmpdir(),
    "/dev",
  ];
  // De-dup (os.tmpdir() usually lives under /private/var/folders).
  const subpaths = [...new Set(writable.map((p) => path.resolve(p)))]
    .map((p) => `  (subpath ${seatbeltQuote(p)})`)
    .join("\n");

  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(deny file-write*)",
    "(allow file-write*",
    subpaths,
    ")",
  ].join("\n");
}

async function runUnderSeatbelt(
  projectPath: string,
  cmd: string,
  env?: Record<string, string>,
): Promise<ExecResult> {
  const profile = buildSeatbeltProfile(projectPath);
  try {
    const { stdout, stderr } = await execFileAsync(
      SANDBOX_EXEC_BIN,
      ["-p", profile, "sh", "-lc", cmd],
      {
        cwd: projectPath,
        env: env ? { ...process.env, ...env } : process.env,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const execError = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      exitCode: typeof execError.code === "number" ? execError.code : 1,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? execError.message ?? String(error),
    };
  }
}

export async function runInSandbox(
  projectPath: string,
  cmd: string,
  env?: Record<string, string>,
): Promise<ExecResult> {
  if (isSeatbeltAvailable()) {
    return runUnderSeatbelt(projectPath, cmd, env);
  }
  // No OS sandbox primitive: the command was already explicitly approved by a
  // human gate — degrade to local execution rather than failing the workflow.
  return runLocalCommand(cmd, projectPath, env);
}
