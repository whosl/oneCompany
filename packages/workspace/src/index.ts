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
export { assertGeneratedRepoHygiene, commitSlice, initRepo, type CommitSliceInput } from "./git.js";
export {
  ensureDevRepoScaffold,
  ensureE2eScaffold,
  ensurePackageRunnable,
  GENERATED_APP_DEV_DEPS,
  findPlaywrightCli,
  findPlaywrightModulePaths,
  findVitestMjs,
  resolvePlaywrightCommand,
  normalizeSliceTestCommand,
  resolveSliceTestCommand,
  resolveTypecheckCommand,
} from "./dev-scaffold.js";
export {
  assertSliceWebExpectedFiles,
  assertWebLayerDelivered,
  isPlaceholderWebPage,
  readPrimaryIndexHtml,
  SCAFFOLD_PLACEHOLDER_TITLE,
  shouldEnforceWebLayer,
  writeMinimalProductWeb,
} from "./web-layer.js";
export { getGitPatch } from "./git-diff.js";
export { classifyCommandChain, splitShellSegments } from "./command-chain.js";
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
  readOutputText,
  redact,
  type OutputRef,
  type RedactionIncident,
  type SecretRegistry,
} from "./log-pipeline.js";
export {
  DockerUnavailableError,
  buildSeatbeltProfile,
  isDockerAvailable,
  isSeatbeltAvailable,
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
  PreviewStartError,
  startPreview,
  stopPreview,
  getPreviewHandle,
  getPreviewHealth,
  buildPreviewPublicPath,
  clearPreviewRegistry,
  resolvePreviewCommand,
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
