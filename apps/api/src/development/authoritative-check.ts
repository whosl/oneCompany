import type { FunctionSliceTask } from "@oc/shared";
import {
  normalizeSliceTestCommand,
  parseVitestJson,
  readOutputText,
  runCommand,
  type ShellDeps,
} from "@oc/workspace";

export function createRunAuthoritativeCheck(shell: ShellDeps): (
  slice: FunctionSliceTask,
  attempt: number,
) => Promise<{ passed: boolean; details: string }> {
  return async (slice, attempt) => {
    const rawCommand = slice.testCommand || "pnpm vitest run --reporter=json";
    const command = normalizeSliceTestCommand(shell.repoPath, rawCommand, slice.id);
    const result = await runCommand(shell, {
      projectId: shell.projectId,
      cmd: command,
      cwd: shell.repoPath,
    });

    const parsed = parseVitestJson(readOutputText(result.outputRef));

    return {
      passed: parsed.passed,
      details: `${parsed.details} (attempt ${attempt})`,
    };
  };
}
