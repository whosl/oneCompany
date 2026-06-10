import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecResult } from "./shell.js";

const execFileAsync = promisify(execFile);

export const SANDBOX_IMAGE = "alpine:3.20";

export class DockerUnavailableError extends Error {
  constructor(message = "Docker is not available for sandbox execution") {
    super(message);
    this.name = "DockerUnavailableError";
  }
}

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

export async function runInSandbox(
  projectPath: string,
  cmd: string,
  env?: Record<string, string>,
): Promise<ExecResult> {
  if (!(await isDockerAvailable())) {
    throw new DockerUnavailableError();
  }

  const envArgs =
    env && Object.keys(env).length > 0
      ? Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`])
      : [];

  const { stdout, stderr } = await execFileAsync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      ...envArgs,
      "-v",
      `${projectPath}:/workspace`,
      "-w",
      "/workspace",
      SANDBOX_IMAGE,
      "sh",
      "-lc",
      cmd,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );

  return { exitCode: 0, stdout, stderr };
}
