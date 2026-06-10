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
export type {
  AuthDecision,
  CodingHarness,
  DevContext,
  SliceResult,
  SliceSpec,
  ToolOp,
} from "./harness/types.js";
