import type { NormalizedRunnerResult } from "@oc/shared";
import { readOutputText } from "../log-pipeline.js";
import { runCommand } from "../shell.js";
import type { RunnerDeps, SuiteSpec } from "./types.js";

export function parseTypecheckOutput(stdout: string, stderr: string): {
  passed: boolean;
  details: string;
  failedCount?: number;
} {
  const combined = `${stdout}\n${stderr}`;
  const errorMatches = combined.match(/error TS\d+:/g) ?? [];
  const failedCount = errorMatches.length;
  if (failedCount > 0) {
    const errorLines = combined
      .split("\n")
      .filter((line) => /error TS\d+:/.test(line))
      .slice(0, 5)
      .map((line) => line.trim());
    const detail = errorLines.length > 0
      ? `typecheck: ${failedCount} error(s): ${errorLines.join(" | ")}`
      : `typecheck: ${failedCount} error(s)`;
    return { passed: false, details: detail, failedCount };
  }
  if (/error/i.test(combined) && !/0 errors?/i.test(combined)) {
    const errorLines = combined
      .split("\n")
      .filter((line) => /error/i.test(line))
      .slice(0, 5)
      .map((line) => line.trim());
    return {
      passed: false,
      details: errorLines.length > 0
        ? `typecheck: errors in output: ${errorLines.join(" | ")}`
        : "typecheck: errors in output",
      failedCount: 1,
    };
  }
  return { passed: true, details: "typecheck: clean" };
}

export async function runTypecheck(
  deps: RunnerDeps,
  spec: SuiteSpec = {
    suite: "final:typecheck",
    command: "pnpm typecheck",
  },
): Promise<NormalizedRunnerResult> {
  const result = await runCommand(deps.shell, {
    projectId: deps.shell.projectId,
    cmd: spec.command,
    cwd: spec.cwd ?? deps.repoPath,
    env: spec.env,
  });

  const stdout = readOutputText(result.outputRef);
  const parsed = parseTypecheckOutput(stdout, "");

  return {
    suite: spec.suite,
    status: parsed.passed ? "passed" : "failed",
    failedCount: parsed.failedCount,
    details: parsed.details,
    logRef: result.outputRef.kind === "chunk" ? result.outputRef.path : undefined,
  };
}
