import type { AgentDefinition, Db } from "@oc/shared";
import { registerAgent } from "../../registry.js";

const AGENT_VERSION = "1.0.0";

export const REQUIREMENT_AGENT_IDS = {
  intake: `intake@${AGENT_VERSION}`,
  analyst: `requirement-analyst@${AGENT_VERSION}`,
  scorer: `completeness-scorer@${AGENT_VERSION}`,
  questionPlanner: `question-planner@${AGENT_VERSION}`,
  prdAcceptance: `prd-acceptance@${AGENT_VERSION}`,
} as const;

export const REQUIREMENT_AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "intake",
    version: AGENT_VERSION,
    group: "requirement",
    role: "Intake Agent",
    description: "Normalizes raw user input",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "cheap" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
  {
    id: "requirement-analyst",
    version: AGENT_VERSION,
    group: "requirement",
    role: "Requirement Analyst Agent",
    description: "Extracts structured requirements",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "standard" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
  {
    id: "completeness-scorer",
    version: AGENT_VERSION,
    group: "requirement",
    role: "Completeness Scorer Agent",
    description: "Scores requirement completeness",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "cheap" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
  {
    id: "question-planner",
    version: AGENT_VERSION,
    group: "requirement",
    role: "Question Planner Agent",
    description: "Plans focused question rounds",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "cheap" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
  {
    id: "prd-acceptance",
    version: AGENT_VERSION,
    group: "requirement",
    role: "PRD And Acceptance Agent",
    description: "Produces PRD and acceptance criteria",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tools: [],
    modelPolicy: { tier: "standard" },
    riskLevel: "low",
    permissions: ["read"],
    executor: "scripted",
  },
];

export function registerRequirementAgents(db: Db): void {
  for (const definition of REQUIREMENT_AGENT_DEFINITIONS) {
    registerAgent(db, definition);
  }
}
