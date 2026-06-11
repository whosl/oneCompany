import type { NormalizedRunnerResult } from "@oc/shared";
import fs from "node:fs";
import path from "node:path";
import { ensureE2eScaffold, findPlaywrightModulePaths, resolvePlaywrightCommand } from "../dev-scaffold.js";
import { readOutputText } from "../log-pipeline.js";
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

  const cwd = spec.cwd ?? deps.repoPath;
  ensureE2eScaffold(cwd);

  const jsonOutputName = "playwright-report.json";
  const modulePaths = findPlaywrightModulePaths(cwd);
  const nodePath = [...modulePaths, process.env.NODE_PATH ?? ""].filter(Boolean).join(path.delimiter);
  const env = {
    ...spec.env,
    BASE_URL: spec.previewUrl,
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOutputName,
    ...(nodePath ? { NODE_PATH: nodePath } : {}),
  };
  const command = resolvePlaywrightCommand(cwd, spec.command ?? "pnpm exec playwright test --reporter=json");

  const result = await runCommand(deps.shell, {
    projectId: deps.shell.projectId,
    cmd: command,
    cwd,
    env,
  });

  const jsonPath = path.join(cwd, jsonOutputName);
  const output = fs.existsSync(jsonPath)
    ? fs.readFileSync(jsonPath, "utf8")
    : readOutputText(result.outputRef);
  const parsed = parsePlaywrightJson(output);
  const passed = result.exitCode === 0 && parsed.passed;

  return {
    suite: spec.suite,
    status: passed ? "passed" : "failed",
    passedCount: parsed.passedCount,
    failedCount: parsed.failedCount,
    details: parsed.details,
    artifactRefs: parsed.artifactRefs,
    logRef: result.outputRef.kind === "chunk" ? result.outputRef.path : undefined,
  };
}
