import type { FunctionSliceTask } from "@oc/shared";
import {
  assertSliceWebExpectedFiles,
  assertWebLayerDelivered,
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

    if (!parsed.passed) {
      return {
        passed: false,
        details: `${parsed.details} (attempt ${attempt})`,
      };
    }

    const webLayer = assertWebLayerDelivered(shell.repoPath, { allowPlaceholder: false });
    if (!webLayer.ok) {
      return {
        passed: false,
        details: `${parsed.details}; ${webLayer.details} (attempt ${attempt})`,
      };
    }

    const expectedFiles = assertSliceWebExpectedFiles(shell.repoPath, slice.expectedFiles);
    const advisory =
      expectedFiles.ok ? expectedFiles.details : `note: ${expectedFiles.details}`;

    return {
      passed: true,
      details: `${parsed.details}; ${webLayer.details}; ${advisory} (attempt ${attempt})`,
    };
  };
}
