import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import { DEVELOPMENT_AGENT_IDS } from "./development/definitions.js";

const REQUIREMENT_SCHEMA_HINTS: Record<string, string> = {
  [REQUIREMENT_AGENT_IDS.intake]: `{
  "normalizedSummary": "string — concise normalized requirement summary",
  "targetUsers": ["string"],
  "userGoals": ["string"],
  "appType": "string — e.g. cli, web, api",
  "missingContext": ["string — unknowns still to clarify"]
}`,
  [REQUIREMENT_AGENT_IDS.analyst]: `{
  "coreFeatures": ["string"],
  "pagesAndFlows": [{ "name": "string", "purpose": "string", "userActions": ["string"] }],
  "dataObjects": [{ "name": "string", "fields": ["string"], "relationships": ["string"] }],
  "rolesAndPermissions": ["string"],
  "integrations": ["string"],
  "nonFunctionalRequirements": ["string"],
  "assumptions": ["string"]
}`,
  [REQUIREMENT_AGENT_IDS.scorer]: `{
  "completenessScore": 0,
  "gaps": [{ "topic": "string", "severity": "low|medium|critical", "question": "string" }]
}`,
  [REQUIREMENT_AGENT_IDS.questionPlanner]: `{
  "topic": "string",
  "questions": ["string — at most 10 focused questions"]
}`,
  [REQUIREMENT_AGENT_IDS.prdAcceptance]: `{
  "prd": "string — markdown PRD body",
  "acceptanceCriteria": "string — markdown bullet list",
  "assumptions": ["string"],
  "risks": ["string"]
}`,
};

const DEVELOPMENT_SCHEMA_HINTS: Record<string, string> = {
  [DEVELOPMENT_AGENT_IDS.architect]: `{
  "techPlan": "string — markdown technical plan",
  "stack": ["string"],
  "architectureNotes": ["string"],
  "risks": ["string"]
}`,
  [DEVELOPMENT_AGENT_IDS.testDesigner]: `{
  "testSpecs": [{ "sliceId": "string", "testCommand": "string", "description": "string" }]
}`,
  [DEVELOPMENT_AGENT_IDS.planner]: `{
  "slices": [{
    "id": "string",
    "title": "string",
    "description": "string",
    "acceptanceChecks": ["string"],
    "testCommand": "string — e.g. pnpm vitest run src/slice.test.ts --reporter=json",
    "expectedFiles": ["string"]
  }],
  "planningNotes": ["string"]
}`,
  [DEVELOPMENT_AGENT_IDS.coding]: `{
  "summary": "string",
  "changedFiles": ["string"],
  "testsAdded": ["string"]
}`,
  [DEVELOPMENT_AGENT_IDS.review]: `{
  "approved": true,
  "findings": ["string"],
  "summary": "string"
}`,
  [DEVELOPMENT_AGENT_IDS.qa]: `{
  "passed": true,
  "notes": ["string"],
  "coverageSummary": "string"
}`,
  [DEVELOPMENT_AGENT_IDS.devopsDelivery]: `{
  "artifacts": ["string"],
  "deploymentNotes": "string",
  "previewHints": ["string"]
}`,
};

const REASONING_HINT = `Also include these string fields in the same JSON object:
  "plan": "brief plan summary visible to the user",
  "observation": "what was observed from the inputs",
  "reflection": "brief reflection on the outcome"`;

export function outputSchemaHint(agentIdAtVersion: string): string {
  const hint =
    REQUIREMENT_SCHEMA_HINTS[agentIdAtVersion] ?? DEVELOPMENT_SCHEMA_HINTS[agentIdAtVersion];
  if (!hint) {
    return [
      "Match the agent output schema exactly; use only the required top-level keys.",
      REASONING_HINT,
    ].join("\n");
  }
  return [
    "Return exactly one JSON object with these top-level keys and shapes (no wrapper keys):",
    hint,
    REASONING_HINT,
  ].join("\n");
}
