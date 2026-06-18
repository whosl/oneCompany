export interface SliceSpec {
  projectId: string;
  sliceId: string;
  goal: string;
  acceptanceChecks: string[];
  testCommand: string;
  /** Advisory starting points — the agent should explore the codebase and may use different paths. */
  expectedFiles?: string[];
  /** Prior attempt evidence for fresh-session retries. */
  retryContext?: string[];
  modelTier: "cheap" | "standard" | "strong";
  /** Key architecture decisions / conventions extracted from the latest tech plan. */
  techContext?: string;
  /** Already-delivered slices (id, title, key files) so the agent knows what exists. */
  predecessors?: Array<{ sliceId: string; title: string; files: string[] }>;
  /** `git ls-files` snapshot of tracked source files (excluding node_modules/dist). */
  repoFileTree?: string[];
}

export interface ToolOp {
  kind: "shell" | "edit" | "read" | "other";
  command?: string;
  path?: string;
}

export type AuthDecision = { allow: true } | { allow: false; reason: string };

export type CommandExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ShellRiskLevel = "low" | "medium" | "medium_constrained" | "high" | "high_deploy";

export interface DevContext {
  repoPath: string;
  projectId: string;
  emit: (event: unknown) => void;
  authorize: (op: ToolOp) => Promise<AuthDecision>;
  logsPath?: string;
  formatToolOutput?: (toolCallId: string, raw: string) => string;
  classifyShellRisk?: (command: string) => ShellRiskLevel;
  runGovernedCommand?: (command: string) => Promise<CommandExecResult>;
  /**
   * Pre-resolved project-level MCP servers in opencode Config["mcp"] shape.
   * The caller (development service) reads project_mcp_configs and converts
   * them; the harness injects them into the opencode code server so the code
   * agent can use project MCPs like codegraph.
   */
  projectMcp?: Record<string, unknown>;
}

export interface SliceResult {
  passed: boolean;
  summary: string;
  changedFiles: string[];
}

export interface ReviewSpec {
  projectId: string;
  sliceId: string;
  goal: string;
  acceptanceChecks: string[];
  /** Planner hints — reviewer may note path mismatches but must not reject solely on these. */
  expectedFiles?: string[];
  /** Commit summary / diff stat shown to the reviewer for orientation. */
  diffSummary?: string;
  modelTier: "cheap" | "standard" | "strong";
}

export interface ReviewResult {
  approved: boolean;
  findings: string[];
  summary: string;
}

export interface CodingHarness {
  runSlice(slice: SliceSpec, ctx: DevContext): Promise<SliceResult>;
  /** Read-only code review of the latest slice commit via the same engine. */
  runReview?(review: ReviewSpec, ctx: DevContext): Promise<ReviewResult>;
  /** Close the persistent lead session for a project (call when dev loop ends). */
  closeProjectSession?(projectId: string): Promise<void>;
}
