import type { AgentDefinition } from "@oc/shared";

export const DUMMY_AGENT: AgentDefinition = {
  id: "dummy",
  version: "1.0.0",
  group: "requirement",
  role: "Dummy Agent",
  description: "Stub agent for M2 orchestration tests",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  tools: [],
  modelPolicy: { tier: "cheap" },
  riskLevel: "low",
  permissions: ["read"],
  executor: "stub",
};
