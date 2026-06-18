import type { FinalSuiteId, NormalizedRunnerResult } from "@oc/shared";
import { runBuild } from "./build.js";
import { runDependencyCheck } from "./dependency-check.js";
import { runPlaywright } from "./playwright.js";
import { runTypecheck } from "./typecheck.js";
import type { RunnerDeps, SuiteSpec } from "./types.js";
import { runVitest } from "./vitest.js";

export { runDependencyCheck } from "./dependency-check.js";
export { parseVitestJson, runVitest } from "./vitest.js";
export { parseTypecheckOutput, runTypecheck } from "./typecheck.js";
export { parseBuildOutput, runBuild } from "./build.js";
export { parsePlaywrightJson, runPlaywright } from "./playwright.js";
export type { RunnerDeps, SuiteSpec };

export async function runSuite(
  deps: RunnerDeps,
  spec: SuiteSpec & { previewUrl?: string },
): Promise<NormalizedRunnerResult> {
  switch (spec.suite) {
    case "final:deps":
      return runDependencyCheck(deps, spec);
    case "final:typecheck":
      return runTypecheck(deps, spec);
    case "final:build":
      return runBuild(deps, spec);
    case "final:vitest":
      return runVitest(deps, spec);
    case "final:playwright":
      return runPlaywright(deps, spec);
    default:
      throw new Error(`Unknown suite: ${spec.suite as string}`);
  }
}

export const DEFAULT_SUITE_ORDER: FinalSuiteId[] = [
  "final:deps",
  "final:typecheck",
  "final:build",
  "final:vitest",
  "final:playwright",
];
