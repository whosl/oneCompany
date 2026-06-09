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
  "npm test",
  "npm run build",
  "git status",
]);

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

export function classifyCommand(cmd: string, ctx: RiskClassifierContext = {}): RiskLevel {
  const normalized = normalizeCommand(cmd);
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

  if (
    /\b(echo|printf)\b.+\s>\s+/i.test(normalized) ||
    /\btouch\b/i.test(normalized) ||
    /\bmkdir\b/i.test(normalized)
  ) {
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
