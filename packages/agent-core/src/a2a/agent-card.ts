import type { AgentDefinition } from "@oc/shared";

/**
 * Minimal A2A AgentCard shape (subset of the A2A protocol's AgentCard).
 *
 * This is the externally-visible capability descriptor served at
 * `/.well-known/agent-card.json`. It is deliberately a subset: OneCompany
 * agents are not standalone A2A servers — they are workflow nodes orchestrated
 * by LangGraph. The card lets external A2A clients *discover* what agents
 * exist and *how* to call them via the OneCompany API, without exposing the
 * internal workflow state machine.
 *
 * Spec reference: OneCompany spec §7/§9 — "AgentDefinition should be mappable
 * to an A2A Agent Card". This file is that mapping.
 */
export type AgentCard = {
  /** Agent id including version, e.g. "intake@1.0.0". */
  id: string;
  version: string;
  /** Human-readable name (maps from AgentDefinition.role). */
  name: string;
  description: string;
  /** Which pipeline group this agent belongs to. */
  group: AgentDefinition["group"];
  /** Capability tags for discovery/filtering. */
  capabilities: string[];
  /** Structured skills (A2A AgentCard.skills equivalent). */
  skills: Array<{ id: string; name: string; description: string }>;
  /** URL where this agent can be addressed (REST-style within OneCompany API). */
  url: string;
  /** What input this agent expects (one-liner). */
  defaultInputDescription?: string;
  /** What this agent produces and who consumes it (one-liner). */
  outputHandoff?: string;
  /** Registered tool ids this agent may call. */
  tools: string[];
  /** Model tier used for routing. */
  modelTier: AgentDefinition["modelPolicy"]["tier"];
  /** Risk level of operations this agent may perform. */
  riskLevel: AgentDefinition["riskLevel"];
  /** Permission flags. */
  permissions: AgentDefinition["permissions"];
};

/**
 * Map an AgentDefinition (DB row) to an externally-visible AgentCard.
 * `baseUrl` is the OneCompany API origin, used to build the agent's `url`.
 */
export function toAgentCard(
  agent: AgentDefinition,
  baseUrl: string,
): AgentCard {
  const trimmedBase = baseUrl.replace(/\/$/, "");
  return {
    id: `${agent.id}@${agent.version}`,
    version: agent.version,
    name: agent.role,
    description: agent.description,
    group: agent.group,
    capabilities: agent.capabilities ?? [],
    skills: agent.skills ?? [],
    url: `${trimmedBase}/agents/${agent.id}/${agent.version}`,
    defaultInputDescription: agent.defaultInputSummary,
    outputHandoff: agent.outputHandoff,
    tools: agent.tools,
    modelTier: agent.modelPolicy.tier,
    riskLevel: agent.riskLevel,
    permissions: agent.permissions,
  };
}
