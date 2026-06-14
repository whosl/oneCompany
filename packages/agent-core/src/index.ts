export {
  formatIdAtVersion,
  getAgent,
  listAgents,
  parseIdAtVersion,
  registerAgent,
} from "./registry.js";
export { pickModel, type ModelTier } from "./router.js";
export {
  runAgent,
  type AgentRunContext,
  type AgentRunner,
  type AgentRunnerResult,
  type AgentRunnerSummaries,
  type ExecutorContext,
  type RunAgentInput,
  type RunAgentResult,
} from "./executor.js";
export {
  registerRequirementAgents,
  REQUIREMENT_AGENT_DEFINITIONS,
  REQUIREMENT_AGENT_IDS,
} from "./agents/requirement/definitions.js";
export { runScriptedRequirementAgent } from "./agents/requirement/scripted-runner.js";
export type {
  RequirementAgentTask,
  RequirementFixtureProfile,
} from "./agents/requirement/types.js";
export { callTool, type CallToolInput, type CallToolResult, type ToolContext } from "./tools.js";
export {
  registerTool,
  getTool,
  resolveToolsForAgent,
  listRegisteredTools,
  type RegisteredTool,
  type ToolProtocol,
  type ToolExecutionContext,
} from "./tools/registry.js";
export { registerLocalTools, ensureLocalToolsRegistered, LOCAL_TOOL_IDS } from "./tools/local-tools.js";
export { DUMMY_AGENT } from "./fixtures.js";
export { runDemoGraph, buildDemoGraph } from "./graph/demo-graph.js";
export type {
  DemoGraphInput,
  DemoGraphState,
  GateHooks,
  OrchestrationContext,
} from "./graph/types.js";
export {
  registerDevelopmentAgents,
  DEVELOPMENT_AGENT_DEFINITIONS,
  DEVELOPMENT_AGENT_IDS,
} from "./agents/development/definitions.js";
export { runScriptedDevAgent } from "./agents/development/scripted-runner.js";
export type { DevAgentTask, DevFixtureProfile } from "./agents/development/types.js";
export {
  buildAgentSystemPrompt,
  buildReviewPrompt,
  buildStructuredAgentPrompts,
  buildTddPrompt,
  type AgentPromptContent,
} from "./agents/prompt-builder.js";
export {
  registerTaiziAgent,
  TAIZI_AGENT_DEFINITION,
  TAIZI_AGENT_ID,
} from "./agents/taizi/definitions.js";
export {
  buildTaiziSystemPrompt,
  classifyTaiziMessage,
  classifyTaiziWithRules,
  isStatusInquiry,
  type TaiziClassifyInput,
} from "./agents/taizi/runner.js";
export {
  DEFAULT_TAIZI_HISTORY_TURNS,
  loadTaiziChatHistory,
  MAX_TAIZI_TURN_CHARS,
  taiziRoutedPayloadsToTurns,
} from "./agents/taizi/history.js";
export {
  appendHistorySection,
  buildTaiziChatMessages,
} from "./agents/taizi/messages.js";
export {
  answerTaiziWithTools,
  buildTaiziAnswerPrompt,
  isWeakTaiziAnswer,
  shouldAnswerWithTools,
  type TaiziAnswerInput,
} from "./agents/taizi/answer-runner.js";
export {
  ensureTaiziToolsRegistered,
  resetTaiziToolsRegistrationForTests,
  TAIZI_READ_TOOL_IDS,
  TAIZI_TOOL_IDS,
} from "./agents/taizi/local-tools.js";
export {
  assertOpenAiConfigured,
  EngineUnavailableError,
  getManagedApiKeys,
  getOpenAiApiKey,
  isOpencodeAvailable,
  resolveEngineMode,
  type EngineMode,
  type ManagedApiKeys,
} from "./engine-mode.js";
export { getEngineReadiness, type EngineReadinessSnapshot } from "./engine-readiness.js";
export { ensureOpencodeOnPath, resolveOpencodeExecutable } from "./util/opencode-cli.js";
export { OPENCODE_NO_FILE_CHANGES_SUMMARY } from "./harness/opencode-harness.js";
export {
  createDevelopmentRunner,
  createRequirementRunner,
  type RunnerFactoryOptions,
} from "./runner-factory.js";
export { StubHarness } from "./harness/stub.js";
export { createOpencodeHarness, OpencodeHarness } from "./harness/opencode-harness.js";
export { resolveCodingHarness } from "./harness/coding-harness-factory.js";
export {
  getActiveHarnessSession,
  steerHarnessSession,
} from "./harness/session-registry.js";
export { handlePermission, toToolOp, type AuthorizeFn } from "./harness/permission-bridge.js";
export { shutdownProjectServer } from "./harness/opencode-server.js";
export type {
  AuthDecision,
  CodingHarness,
  DevContext,
  SliceResult,
  SliceSpec,
  ToolOp,
} from "./harness/types.js";
