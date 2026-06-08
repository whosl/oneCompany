import type { FinalSuiteId, NormalizedRunnerResult } from "@oc/shared";
import type { ShellDeps } from "../shell.js";

export type SuiteSpec = {
  suite: FinalSuiteId;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
};

export type RunnerDeps = {
  shell: ShellDeps;
  repoPath: string;
};

export type { NormalizedRunnerResult };

export type SuiteRunner = (
  deps: RunnerDeps,
  spec: SuiteSpec,
) => Promise<NormalizedRunnerResult>;
