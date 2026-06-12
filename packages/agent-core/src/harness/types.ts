export interface SliceSpec {
  projectId: string;
  sliceId: string;
  goal: string;
  acceptanceChecks: string[];
  testCommand: string;
  /** Planner hints — coding agent should create these when feasible. */
  expectedFiles?: string[];
  modelTier: "cheap" | "standard" | "strong";
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
