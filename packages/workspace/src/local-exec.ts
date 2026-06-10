import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExecResult } from "./shell.js";

const execAsync = promisify(exec);

export async function runLocalCommand(
  cmd: string,
  cwd: string,
  env?: Record<string, string>,
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout: stdout ?? "",
      stderr: stderr ?? "",
    };
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
