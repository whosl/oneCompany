import type { NormalizedRunnerResult } from "@oc/shared";
import { readOutputText } from "../log-pipeline.js";
import { runCommand } from "../shell.js";
import type { RunnerDeps, SuiteSpec } from "./types.js";

export type VitestJsonReport = {
  numFailedTests?: number;
  numPassedTests?: number;
  success?: boolean;
};

export function parseVitestJson(stdout: string): {
  passed: boolean;
  details: string;
  passedCount?: number;
  failedCount?: number;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { passed: false, details: "empty vitest output" };
  }

  // vitest --reporter=json still emits non-JSON content (RUN banner, progress
  // ticks, ANSI codes) before/after the JSON blob. Extracting the substring
  // from the first '{' to the matching last '}' makes the parse robust against
  // that noise — previously the whole stdout was JSON.parsed, which failed with
  // "invalid vitest json output" whenever any extra text was present.
  let report: VitestJsonReport;
  try {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    const jsonText =
      firstBrace >= 0 && lastBrace > firstBrace
        ? trimmed.slice(firstBrace, lastBrace + 1)
        : trimmed;
    report = JSON.parse(jsonText) as VitestJsonReport;
  } catch {
    return { passed: false, details: "invalid vitest json output" };
  }

  const failed = report.numFailedTests ?? 0;
  const passedCount = report.numPassedTests ?? 0;
  const totalTests =
    (report as VitestJsonReport & { numTotalTests?: number }).numTotalTests ??
    passedCount + failed;

  if (totalTests === 0 && passedCount === 0 && failed === 0) {
    return {
      passed: false,
      details: "vitest: no tests executed (missing test files or wrong cwd)",
      passedCount: 0,
      failedCount: 0,
    };
  }

  const passed = report.success ?? failed === 0;
  return {
    passed,
    details: `vitest: failed=${failed}, passed=${passedCount}`,
    passedCount: report.numPassedTests,
    failedCount: failed,
  };
}

export async function runVitest(
  deps: RunnerDeps,
  spec: SuiteSpec = {
    suite: "final:vitest",
    command: "pnpm vitest run --reporter=json",
  },
): Promise<NormalizedRunnerResult> {
  const result = await runCommand(deps.shell, {
    projectId: deps.shell.projectId,
    cmd: spec.command,
    cwd: spec.cwd ?? deps.repoPath,
    env: spec.env,
  });

  const parsed = parseVitestJson(readOutputText(result.outputRef));

  return {
    suite: spec.suite,
    status: parsed.passed ? "passed" : "failed",
    passedCount: parsed.passedCount,
    failedCount: parsed.failedCount,
    details: parsed.details,
    logRef: result.outputRef.kind === "chunk" ? result.outputRef.path : undefined,
  };
}
