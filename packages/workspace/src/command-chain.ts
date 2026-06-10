import { classifyCommand, type RiskClassifierContext, type RiskLevel } from "./risk.js";

export { splitShellSegments } from "./risk.js";

/**
 * Chain-aware risk classification. `classifyCommand` itself splits compound
 * commands and takes the riskiest segment; this alias remains for callers
 * that adopted the chain API explicitly.
 */
export function classifyCommandChain(
  command: string,
  ctx: RiskClassifierContext = {},
): RiskLevel {
  return classifyCommand(command, ctx);
}
