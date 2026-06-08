import type { NormalizedRunnerResult } from "@oc/shared";
import { runCommand } from "../shell.js";
import type { RunnerDeps, SuiteSpec } from "./types.js";

export type PlaywrightJsonReport = {
  stats?: { unexpected?: number; expected?: number };
  suites?: Array<{
    specs?: Array<{
      tests?: Array<{ results?: Array<{ status?: string; attachments?: Array<{ path?: string }> }> }>;
    }>;
  }>;
};

export function parsePlaywrightJson(stdout: string): {
  passed: boolean;
  details: string;
  failedCount?: number;
  passedCount?: number;
  artifactRefs?: string[];
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { passed: false, details: "empty playwright output" };
  }

  let report: PlaywrightJsonReport;
  try {
    report = JSON.parse(trimmed) as PlaywrightJsonReport;
  } catch {
    return { passed: false, details: "invalid playwright json output" };
  }

  const unexpected = report.stats?.unexpected ?? 0;
  const expected = report.stats?.expected ?? 0;
  const artifactRefs: string[] = [];

  for (const suite of report.suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          for (const attachment of result.attachments ?? []) {
            if (attachment.path) {
              artifactRefs.push(attachment.path);
            }
          }
        }
      }
    }
  }

  return {
    passed: unexpected === 0,
    details: `playwright: unexpected=${unexpected}, expected=${expected}`,
    failedCount: unexpected,
    passedCount: expected,
    artifactRefs: artifactRefs.length > 0 ? artifactRefs : undefined,
  };
}

export async function runPlaywright(
  deps: RunnerDeps,
  spec: SuiteSpec & { previewUrl?: string },
): Promise<NormalizedRunnerResult> {
  if (!spec.previewUrl) {
    return {
      suite: spec.suite,
      status: "failed",
      details: "playwright: preview URL required",
    };
  }

  const env = {
    ...spec.env,
    BASE_URL: spec.previewUrl,
    PLAYWRIGHT_JSON_OUTPUT_NAME: "playwright-report.json",
  };
  const command = spec.command ?? "pnpm exec playwright test --reporter=json";

  const result = await runCommand(deps.shell, {
    projectId: deps.shell.projectId,
    cmd: command,
    cwd: spec.cwd ?? deps.repoPath,
  });

  const output =
    result.outputRef.kind === "inline" ? (result.outputRef.text ?? "") : "";
  const parsed = parsePlaywrightJson(output);

  return {
    suite: spec.suite,
    status: parsed.passed ? "passed" : "failed",
    passedCount: parsed.passedCount,
    failedCount: parsed.failedCount,
    details: parsed.details,
    artifactRefs: parsed.artifactRefs,
    logRef: result.outputRef.kind === "chunk" ? result.outputRef.path : undefined,
  };
}
