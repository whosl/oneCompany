export interface SliceSpec {
  projectId: string;
  sliceId: string;
  goal: string;
  acceptanceChecks: string[];
  testCommand: string;
  /** Planner hints — coding agent should create these when feasible. */
  expectedFiles?: string[];
  modelTier: "cheap" | "standard" | "strong";
  /**
   * Prior attempt context injected by the engine on retries. Lets the coding
   * agent see the last failure (test/typecheck output) and any review findings
   * instead of starting each retry from a blank prompt. Undefined on the first
   * attempt of a slice.
   */
  previousFailure?: {
    attempt: number;
    testDetails?: string;
    typecheckDetails?: string;
    reviewFindings?: string[];
  };
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

/**
 * Outcome of asking the human a clarifying question from inside a coding slice.
 * - "answered": the human provided a free-text answer to inject into the session.
 * - "skipped": the human declined; the agent should make a reasonable assumption.
 */
export type AskHumanResult =
  | { kind: "answered"; answer: string }
  | { kind: "skipped" };

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
   * Surface a clarifying question to the human and block until they answer or
   * skip. Used when the coding agent outputs a structured question signal. The
   * returned answer is re-injected into the same opencode session so work
   * continues with the human's guidance. Undefined when the deployment cannot
   * surface gates (stub mode / unconfigured); the harness treats that as a
   * no-file-change outcome and lets the authoritative test decide.
   */
  askHuman?: (question: string) => Promise<AskHumanResult>;
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
}
