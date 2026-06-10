import { classifyCommand, type RiskClassifierContext, type RiskLevel } from "./risk.js";

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  medium_constrained: 2,
  high: 3,
  high_deploy: 4,
};

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
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
    const nextNext = command[index + 2];

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

export function classifyCommandChain(
  command: string,
  ctx: RiskClassifierContext = {},
): RiskLevel {
  const segments = splitShellSegments(command);
  return segments.reduce<RiskLevel>(
    (highest, segment) => maxRisk(highest, classifyCommand(segment, ctx)),
    "low",
  );
}
