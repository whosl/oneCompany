export { PathEscapeError, type WorkspaceMeta, type WorkspacePaths } from "./types.js";
export { assertInsideRepo, resolveScopedPath } from "./paths.js";
export {
  createWorkspace,
  ensureWorkspace,
  getGeneratedProjectsRoot,
  listFiles,
  loadWorkspace,
  readFile,
  writeFile,
} from "./workspace.js";
export { runLocalCommand } from "./local-exec.js";
export { commitSlice, initRepo, type CommitSliceInput } from "./git.js";
export {
  classifyCommand,
  classifyToolOp,
  type RiskClassifierContext,
  type RiskLevel,
  type WorkspaceToolOp,
} from "./risk.js";
export {
  INLINE_OUTPUT_MAX_BYTES,
  REDACTED,
  persistOutput,
  redact,
  type OutputRef,
  type RedactionIncident,
  type SecretRegistry,
} from "./log-pipeline.js";
export {
  DockerUnavailableError,
  SANDBOX_IMAGE,
  isDockerAvailable,
  runInSandbox,
} from "./sandbox.js";
export {
  CommandRejectedError,
  runCommand,
  type ExecResult,
  type GateRecord,
  type RunCommandInput,
  type RunCommandResult,
  type ShellDeps,
} from "./shell.js";
export { createAuthorize, type AuthorizeDeps } from "./authorize.js";
export {
  startPreview,
  stopPreview,
  getPreviewHandle,
  getPreviewHealth,
  clearPreviewRegistry,
  type PreviewHandle,
} from "./preview.js";
export {
  runSuite,
  runVitest,
  runTypecheck,
  runBuild,
  runPlaywright,
  parseVitestJson,
  parseTypecheckOutput,
  parseBuildOutput,
  parsePlaywrightJson,
  DEFAULT_SUITE_ORDER,
  type RunnerDeps,
  type SuiteSpec,
} from "./runners/index.js";
