import type { FunctionSliceTask } from "@oc/shared";
import { parseVitestJson, runCommand, type ShellDeps } from "@oc/workspace";

export function createRunAuthoritativeCheck(shell: ShellDeps): (
  slice: FunctionSliceTask,
  attempt: number,
) => Promise<{ passed: boolean; details: string }> {
  return async (slice, attempt) => {
    const command = slice.testCommand || "pnpm vitest run --reporter=json";
    const result = await runCommand(shell, {
      projectId: shell.projectId,
      cmd: command,
      cwd: shell.repoPath,
    });

    const output =
      result.outputRef.kind === "inline" ? (result.outputRef.text ?? "") : "";
    const parsed = parseVitestJson(output);

    return {
      passed: parsed.passed,
      details: `${parsed.details} (attempt ${attempt})`,
    };
  };
}
