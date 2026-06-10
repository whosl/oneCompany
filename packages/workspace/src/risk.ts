import fs from "node:fs";
import path from "node:path";

export type RiskLevel =
  | "low"
  | "medium"
  | "medium_constrained"
  | "high"
  | "high_deploy";

export type WorkspaceToolOp = {
  kind: "shell" | "edit" | "read" | "other";
  command?: string;
  path?: string;
};

export type RiskClassifierContext = {
  repoPath?: string;
  lockfilePresent?: boolean;
  registryPinned?: boolean;
};

const LOW_COMMANDS = new Set([
  "ls",
  "rg",
  "cat",
  "pwd",
  "env",
  "npm test",
  "npm run build",
  "git status",
]);

/** Read-only git subcommands never need a gate. */
const GIT_READ_PATTERN =
  /^git\s+(status|log|diff|show|branch|rev-parse|remote|describe|blame|ls-files)\b/i;

/** Local-only git mutations: versioned, recoverable, repo-scoped. */
const GIT_LOCAL_WRITE_PATTERN =
  /^git\s+(init|add|commit|checkout|switch|restore|stash|merge|rebase|tag|mv|rm)\b/i;

/**
 * Project test / build / lint commands. These dominated the dangerous-operation
 * gate volume in real runs (28 gates per project, ~10 min of human waiting),
 * yet they are repo-scoped and produce no irreversible side effects.
 */
const DEV_TASK_PATTERN =
  /^(?:(?:pnpm|npm|yarn|bun)\s+(?:run\s+|exec\s+)?|npx\s+)?(vitest|jest|tsc|test|build|typecheck|lint|check|format|eslint|prettier|playwright)\b/i;

/** Inline node snippets that obviously reach outside the repo stay gated. */
const NODE_DANGER_PATTERN =
  /child_process|execSync|spawnSync|\bexec\(|\bspawn\(|\brmSync\b|\bhttps?\.|fetch\(|process\.kill/i;

const DEPLOY_PATTERNS = [
  /\bvercel\s+deploy\b/i,
  /\bcloudflared\s+tunnel\b/i,
  /\bwrangler\s+deploy\b/i,
  /\bnpm\s+run\s+deploy\b/i,
];

const HIGH_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bnpm\s+install\b/i,
  /\bnpm\s+i\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bmigration\b.*\b(drop|delete|truncate)\b/i,
];

const MEDIUM_CONSTRAINED_PATTERN = /\bnpm\s+ci\b.*--ignore-scripts\b/i;

function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/g, " ");
}

/** Split shell command chains on ; && || and | (top-level, quote-aware). */
export function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) {
      segments.push(trimmed);
    }
    current = "";
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    const next = command[index + 1];

    if (quote) {
      current += char;
      if (char === quote && command[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ";" || (char === "&" && next === "&") || (char === "|" && next === "|")) {
      pushCurrent();
      if (char !== ";") {
        index += 1;
      }
      continue;
    }

    if (char === "|" && next !== "|") {
      pushCurrent();
      continue;
    }

    current += char;
  }

  pushCurrent();
  return segments.length > 0 ? segments : [command.trim()].filter(Boolean);
}

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  medium_constrained: 2,
  high: 3,
  high_deploy: 4,
};

/** All absolute paths referenced by the command must live inside the repo. */
function absolutePathsConfined(normalized: string, ctx: RiskClassifierContext): boolean {
  const absPaths = normalized.match(/(?:^|[\s="'])(\/[^\s"']+)/g) ?? [];
  if (absPaths.length === 0) {
    return true;
  }
  if (!ctx.repoPath) {
    return false;
  }
  const repo = path.resolve(ctx.repoPath);
  return absPaths.every((raw) => {
    const candidate = raw.replace(/^[\s="']+/, "");
    return path.resolve(candidate).startsWith(repo);
  });
}

function hasLockfile(ctx: RiskClassifierContext): boolean {
  if (ctx.lockfilePresent !== undefined) {
    return ctx.lockfilePresent;
  }
  if (!ctx.repoPath) {
    return false;
  }
  return (
    fs.existsSync(path.join(ctx.repoPath, "package-lock.json")) ||
    fs.existsSync(path.join(ctx.repoPath, "pnpm-lock.yaml"))
  );
}

function isRegistryPinned(ctx: RiskClassifierContext): boolean {
  if (ctx.registryPinned !== undefined) {
    return ctx.registryPinned;
  }
  if (!ctx.repoPath) {
    return false;
  }
  const npmrc = path.join(ctx.repoPath, ".npmrc");
  if (!fs.existsSync(npmrc)) {
    return false;
  }
  return fs.readFileSync(npmrc, "utf8").includes("registry=");
}

/**
 * Chain-aware classification: compound commands (`a && b | c`) are split into
 * segments and the riskiest segment wins. This both prevents escalation of
 * harmless chains (`cd repo && pnpm vitest`) and closes the old hole where a
 * chain starting with a read-only command hid a dangerous tail
 * (`ls && rm -rf …` used to classify as low).
 */
export function classifyCommand(cmd: string, ctx: RiskClassifierContext = {}): RiskLevel {
  const segments = splitShellSegments(cmd);
  if (segments.length === 0) {
    return "high";
  }
  return segments.reduce<RiskLevel>((highest, segment) => {
    const risk = classifySegment(segment, ctx);
    return RISK_RANK[risk] >= RISK_RANK[highest] ? risk : highest;
  }, "low");
}

function classifySegment(segment: string, ctx: RiskClassifierContext): RiskLevel {
  const normalized = normalizeCommand(segment);
  if (!normalized) {
    return "high";
  }

  for (const pattern of DEPLOY_PATTERNS) {
    if (pattern.test(normalized)) {
      return "high_deploy";
    }
  }

  if (LOW_COMMANDS.has(normalized)) {
    return "low";
  }

  if (/^\b(echo|printf)\b/i.test(normalized) && !/\s>\s*/.test(normalized)) {
    return "low";
  }

  // Read-only / navigation segments (single segment after chain splitting).
  if (/^cd(\s|$)/i.test(normalized) && !/\s>\s*/.test(normalized)) {
    return "low";
  }
  if (
    /^(tail|head|grep|wc|sort|uniq|cat|ls|pwd|which|whoami|date|true|find|file|stat|du|tree)\b/i.test(
      normalized,
    ) &&
    !/\s>\s*/.test(normalized) &&
    !/\bfind\b.*(-delete|-exec)\b/i.test(normalized)
  ) {
    return "low";
  }
  if (GIT_READ_PATTERN.test(normalized)) {
    return "low";
  }
  if (/^node\s+(--version|-v)$/i.test(normalized)) {
    return "low";
  }

  if (MEDIUM_CONSTRAINED_PATTERN.test(normalized)) {
    if (hasLockfile(ctx) && isRegistryPinned(ctx)) {
      return "medium_constrained";
    }
    return "high";
  }

  if (/\bnpm\s+ci\b/i.test(normalized)) {
    return "high";
  }

  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(normalized)) {
      return "high";
    }
  }

  // `rm` without -rf: recoverable cleanup, but only inside the project repo.
  if (/^rm\b/i.test(normalized)) {
    if (/\s-[a-z]*r[a-z]*f|\s-[a-z]*f[a-z]*r/i.test(normalized)) {
      return "high"; // recursive force delete — always gate
    }
    return absolutePathsConfined(normalized, ctx) ? "medium" : "high";
  }

  if (
    /\b(echo|printf)\b.+\s>\s*/i.test(normalized) ||
    /\btouch\b/i.test(normalized) ||
    /\bmkdir\b/i.test(normalized) ||
    /^cp\b/i.test(normalized) ||
    /^mv\b/i.test(normalized)
  ) {
    return "medium";
  }

  if (GIT_LOCAL_WRITE_PATTERN.test(normalized)) {
    return "medium";
  }

  // Project test / build / lint tasks — repo-scoped, no gate needed.
  if (DEV_TASK_PATTERN.test(normalized)) {
    return "medium";
  }
  if (
    /\b(pnpm|npm|npx)\s+(exec\s+)?(vitest|test)\b/i.test(normalized) ||
    /\bvitest\s+run\b/i.test(normalized) ||
    // Authoritative checks rewrite `pnpm vitest ...` to `node ".../vitest.mjs" run ...`
    // (see resolveSliceTestCommand); treat the resolved binary as a test command, not high-risk.
    /\bvitest\.mjs\b/i.test(normalized)
  ) {
    return "medium";
  }

  // Inline node evals / local scripts: the agents probe module resolution this
  // way constantly. Gate only when the snippet reaches for processes/network.
  if (/^node\s+(-e|--eval)\b/i.test(normalized)) {
    return NODE_DANGER_PATTERN.test(normalized) ? "high" : "medium";
  }
  if (/^node\s+\S+\.(mjs|cjs|js|ts)\b/i.test(normalized)) {
    return NODE_DANGER_PATTERN.test(normalized) ? "high" : "medium";
  }

  return "high";
}

export function classifyToolOp(op: WorkspaceToolOp, ctx: RiskClassifierContext = {}): RiskLevel {
  if (op.path) {
    if (path.isAbsolute(op.path) || op.path.split(/[/\\]/).includes("..")) {
      return "high";
    }
  }

  switch (op.kind) {
    case "read":
      return "low";
    case "edit":
      return "medium";
    case "shell":
      return classifyCommand(op.command ?? "", ctx);
    default:
      return "high";
  }
}
