import type { NormalizedRunnerResult } from "@oc/shared";
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
    return {
      passed: false,
      details: `typecheck: ${failedCount} error(s)`,
      failedCount,
    };
  }
  if (/error/i.test(combined) && !/0 errors?/i.test(combined)) {
    return { passed: false, details: "typecheck: errors in output", failedCount: 1 };
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
  });

  const stdout = result.outputRef.kind === "inline" ? (result.outputRef.text ?? "") : "";
  const parsed = parseTypecheckOutput(stdout, "");

  return {
    suite: spec.suite,
    status: parsed.passed ? "passed" : "failed",
    failedCount: parsed.failedCount,
    details: parsed.details,
    logRef: result.outputRef.kind === "chunk" ? result.outputRef.path : undefined,
  };
}
