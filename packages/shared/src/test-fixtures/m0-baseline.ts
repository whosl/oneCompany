import type { AgentDefinition } from "../schemas/agent-definition.js";
import type { DevState } from "../schemas/dev-state.js";
import type { EventEnvelope } from "../schemas/event-envelope.js";
import type { RequirementState } from "../schemas/requirement-state.js";

export const validEventEnvelope: EventEnvelope = {
  eventId: "evt-baseline-1",
  seq: 1,
  schemaVersion: "1",
  projectId: "proj-baseline",
  timestamp: "2026-06-08T12:00:00.000Z",
  payload: {
    type: "project.created",
    projectId: "proj-baseline",
    name: "Baseline App",
  },
};

export const validRequirementState: RequirementState = {
  projectId: "proj-baseline",
  rawRequirement: "Build a todo app",
  normalizedSummary: "A simple todo web application",
  targetUsers: ["individual developers"],
  userGoals: ["track tasks"],
  coreFeatures: ["create todos", "mark complete"],
  pagesAndFlows: [
    {
      name: "Home",
      purpose: "List todos",
      userActions: ["add", "complete"],
    },
  ],
  dataObjects: [{ name: "Todo", fields: ["id", "title", "done"] }],
  rolesAndPermissions: ["owner"],
  integrations: [],
  nonFunctionalRequirements: ["local-first"],
  risks: [],
  assumptions: [],
  gaps: [],
  completenessScore: 72,
  completenessThreshold: 85,
  maxQuestionRounds: 6,
  clarificationSkipped: false,
  questionRounds: [],
};

export const validDevState: DevState = {
  projectId: "proj-baseline",
  repoPath: "/tmp/generated-projects/baseline/repo",
  worktreePath: "/tmp/generated-projects/baseline/repo",
  sandboxMode: "local",
  techPlanVersion: "tp-1",
  taskQueue: [
    {
      id: "slice-1",
      title: "Scaffold app",
      testCommand: "pnpm vitest run src/scaffold.test.ts --reporter=json",
    },
  ],
  maxSliceAttempts: 4,
  currentSliceAttempts: 0,
  testResults: [],
  diffs: [],
  commits: [],
  deliveryArtifacts: [],
  risks: [],
};

export const validAgentDefinition: AgentDefinition = {
  id: "intake",
  version: "1.0.0",
  group: "requirement",
  role: "Intake Agent",
  description: "Normalizes raw user input",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  tools: [],
  modelPolicy: { tier: "standard" },
  riskLevel: "low",
  permissions: ["read"],
  executor: "openai-agents-sdk",
};
