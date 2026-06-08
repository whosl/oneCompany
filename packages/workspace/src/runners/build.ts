import type { NormalizedRunnerResult } from "@oc/shared";
import { runCommand } from "../shell.js";
import type { RunnerDeps, SuiteSpec } from "./types.js";

export function parseBuildOutput(stdout: string, stderr: string, exitCode: number): {
  passed: boolean;
  details: string;
} {
  const combined = `${stdout}\n${stderr}`;
  if (/build failed|error/i.test(combined) && exitCode !== 0) {
    return { passed: false, details: "build: failed" };
  }
  if (exitCode !== 0) {
    return { passed: false, details: `build: exit code ${exitCode}` };
  }
  return { passed: true, details: "build: succeeded" };
}

export async function runBuild(
  deps: RunnerDeps,
  spec: SuiteSpec = {
    suite: "final:build",
    command: "pnpm build",
  },
): Promise<NormalizedRunnerResult> {
  const result = await runCommand(deps.shell, {
    projectId: deps.shell.projectId,
    cmd: spec.command,
    cwd: spec.cwd ?? deps.repoPath,
  });

  const stdout = result.outputRef.kind === "inline" ? (result.outputRef.text ?? "") : "";
  const parsed = parseBuildOutput(stdout, "", result.exitCode);

  return {
    suite: spec.suite,
    status: parsed.passed ? "passed" : "failed",
    details: parsed.details,
    logRef: result.outputRef.kind === "chunk" ? result.outputRef.path : undefined,
  };
}
