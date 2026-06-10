import {
  GATE_DEFINITIONS,
  GATE_TYPES,
  ProjectStatusSchema,
  type ConsoleSnapshot,
  type EventEnvelope,
  type GateTypeId,
  type ProjectStatus,
} from "@oc/shared";
import type { ComposerMode } from "./types";

type ScenarioCategory = "status" | "gate" | "edge";

export type ProjectionScenario = {
  id: string;
  label: string;
  category: ScenarioCategory;
  status: ProjectStatus;
  expectedComposerMode: ComposerMode;
  snapshot: ConsoleSnapshot;
};

type ScenarioOptions = {
  id: string;
  label: string;
  category: ScenarioCategory;
  status: ProjectStatus;
  gateTypes?: GateTypeId[];
  expectedComposerMode: ComposerMode;
  pausedFrom?: ProjectStatus;
};

const CREATED_AT = "2026-06-10T08:00:00.000Z";
const PROJECT_ID = "ui-v2-scenario";

const STATUS_CONFIG: Record<
  ProjectStatus,
  { activeGroup: string; progressLabel: string; gateType?: GateTypeId; mode: ComposerMode }
> = {
  "Draft Requirement": {
    activeGroup: "Requirement Group",
    progressLabel: "Describe the product",
    mode: "requirement",
  },
  "Asking Questions": {
    activeGroup: "Requirement Group",
    progressLabel: "Question round 2 / 6",
    mode: "question_round",
  },
  "PRD Ready": {
    activeGroup: "Requirement Group",
    progressLabel: "PRD confirmation",
    gateType: "requirement_confirm",
    mode: "gate_decision",
  },
  "Tech Plan Review": {
    activeGroup: "Development Group",
    progressLabel: "Technical plan confirmation",
    gateType: "tech_plan_confirm",
    mode: "gate_decision",
  },
  Developing: {
    activeGroup: "Development Group",
    progressLabel: "Slice 2 / 4",
    mode: "change_request",
  },
  "Change Review": {
    activeGroup: "Development Group",
    progressLabel: "Change impact review",
    gateType: "change_review",
    mode: "gate_decision",
  },
  Testing: {
    activeGroup: "Development Group",
    progressLabel: "Final suite 2 / 4",
    mode: "change_request",
  },
  Deploying: {
    activeGroup: "Development Group",
    progressLabel: "Deployment confirmation",
    gateType: "deployment",
    mode: "deployment_url",
  },
  "Awaiting Acceptance": {
    activeGroup: "Development Group",
    progressLabel: "Final acceptance",
    gateType: "final_acceptance",
    mode: "gate_decision",
  },
  Delivered: {
    activeGroup: "Development Group",
    progressLabel: "Delivered",
    mode: "read_only",
  },
  Failed: {
    activeGroup: "Development Group",
    progressLabel: "Failed",
    mode: "read_only",
  },
  Paused: {
    activeGroup: "Development Group",
    progressLabel: "Paused during Slice 2 / 4",
    mode: "paused",
  },
};

const GATE_STATUS: Record<GateTypeId, ProjectStatus> = {
  requirement_confirm: "PRD Ready",
  tech_plan_confirm: "Tech Plan Review",
  requirement_stuck: "Asking Questions",
  slice_failure: "Developing",
  change_review: "Change Review",
  deployment: "Deploying",
  dangerous_operation: "Developing",
  final_acceptance: "Awaiting Acceptance",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function envelope(
  seq: number,
  payload: EventEnvelope["payload"],
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    eventId: `scenario-event-${seq}`,
    seq,
    schemaVersion: "1",
    projectId: PROJECT_ID,
    timestamp: `2026-06-10T08:${String(seq).padStart(2, "0")}:00.000Z`,
    payload,
    ...overrides,
  };
}

function gateSnapshot(gateType: GateTypeId, index: number): ConsoleSnapshot["openGates"][number] {
  return {
    id: `gate-${gateType}-${index}`,
    gateType,
    status: "open",
    options: [...GATE_DEFINITIONS[gateType].allowedOptions],
    decision: null,
    createdAt: `2026-06-10T08:${String(index + 10).padStart(2, "0")}:00.000Z`,
  };
}

function requirement(status: ProjectStatus): ConsoleSnapshot["requirement"] {
  if (status === "Draft Requirement") return undefined;
  return {
    rawRequirement: "Build a governed multi-agent project workspace.",
    normalizedSummary: "Multi-agent workspace with workflow gates, tests, and delivery reporting.",
    completenessScore: status === "Asking Questions" ? 68 : 92,
    completenessLocked: status !== "Asking Questions",
    settledChips: ["Primary users confirmed", "Agent roles confirmed"],
    upcomingChips: status === "Delivered" ? [] : ["Final acceptance pending"],
    pendingQuestions:
      status === "Asking Questions"
        ? [{ question: "Which deployment target should be supported?", suggestedAnswers: ["Vercel", "Cloudflare"] }]
        : undefined,
  };
}

function buildEvents(status: ProjectStatus, gates: ConsoleSnapshot["openGates"]): EventEnvelope[] {
  const events: EventEnvelope[] = [
    envelope(1, { type: "project.created", projectId: PROJECT_ID, name: `UI v2 ${status}` }),
    envelope(2, { type: "project.status_changed", projectId: PROJECT_ID, status }),
  ];

  const hasAgentRun = ["Developing", "Testing", "Failed", "Paused"].includes(status);
  if (hasAgentRun) {
    events.push(
      envelope(
        events.length + 1,
        { type: "agent.started", projectId: PROJECT_ID, agentId: "coding@scenario", runId: "run-scenario" },
        { agentId: "coding@scenario", runId: "run-scenario" },
      ),
      envelope(
        events.length + 2,
        { type: "agent.plan", projectId: PROJECT_ID, agentId: "coding@scenario", summary: "Execute the active workflow step." },
        { agentId: "coding@scenario", runId: "run-scenario" },
      ),
    );
  }

  if (status === "Testing") {
    events.push(
      envelope(events.length + 1, {
        type: "test.result",
        projectId: PROJECT_ID,
        suite: "final:typecheck",
        status: "passed",
      }),
    );
  }
  if (status === "Deploying") {
    events.push(envelope(events.length + 1, { type: "deployment.started", projectId: PROJECT_ID }));
  }
  if (status === "Delivered") {
    events.push(
      envelope(events.length + 1, {
        type: "delivery.report_generated",
        projectId: PROJECT_ID,
        artifactPath: "reports/delivery-report.md",
      }),
    );
  }
  if (status === "Failed") {
    events.push(
      envelope(
        events.length + 1,
        {
          type: "run.failed",
          projectId: PROJECT_ID,
          agentId: "coding@scenario",
          runId: "run-scenario",
          reason: "Scenario failure for terminal-state verification.",
        },
        { agentId: "coding@scenario", runId: "run-scenario" },
      ),
    );
  }

  for (const gate of gates) {
    events.push(
      envelope(events.length + 1, {
        type: "human_gate.created",
        projectId: PROJECT_ID,
        gateId: gate.id,
        gateType: gate.gateType,
      }),
    );
  }
  return events;
}

function buildScenario(options: ScenarioOptions): ProjectionScenario {
  const config = STATUS_CONFIG[options.status];
  const gateTypes = options.gateTypes ?? (config.gateType ? [config.gateType] : []);
  const openGates = gateTypes.map(gateSnapshot);
  const events = buildEvents(options.status, openGates);
  const snapshot: ConsoleSnapshot = {
    project: {
      id: PROJECT_ID,
      name: options.label,
      slug: `ui-v2/${options.id}`,
      status: options.status,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    phase: {
      label: options.status,
      activeGroup: config.activeGroup,
      progressLabel: config.progressLabel,
    },
    requirement: requirement(options.status),
    dev: ["Developing", "Change Review", "Testing", "Deploying", "Awaiting Acceptance", "Delivered", "Failed", "Paused"].includes(options.status)
      ? { currentSliceId: "slice-2", sliceIndex: 1, sliceTotal: 4, previewUrl: "http://localhost:3100" }
      : undefined,
    testing:
      options.status === "Testing"
        ? { phase: "running", previewUrl: "http://localhost:3100", suitePassed: 1, suiteTotal: 4 }
        : undefined,
    risks: gateTypes.includes("dangerous_operation") ? ["External command requires approval."] : [],
    openGates,
    pausedFrom: options.pausedFrom,
    events,
    lastSeq: events.at(-1)?.seq ?? 0,
  };

  return {
    id: options.id,
    label: options.label,
    category: options.category,
    status: options.status,
    expectedComposerMode: options.expectedComposerMode,
    snapshot,
  };
}

export const statusScenarios: ProjectionScenario[] = ProjectStatusSchema.options.map((status) => {
  const config = STATUS_CONFIG[status];
  return buildScenario({
    id: `status-${slug(status)}`,
    label: `${status} scenario`,
    category: "status",
    status,
    gateTypes: status === "Paused" ? ["dangerous_operation"] : undefined,
    expectedComposerMode: config.mode,
    pausedFrom: status === "Paused" ? "Developing" : undefined,
  });
});

export const gateScenarios: ProjectionScenario[] = GATE_TYPES.map((gateType) =>
  buildScenario({
    id: `gate-${gateType}`,
    label: `${GATE_DEFINITIONS[gateType].title} scenario`,
    category: "gate",
    status: GATE_STATUS[gateType],
    gateTypes: [gateType],
    expectedComposerMode: gateType === "deployment" ? "deployment_url" : "gate_decision",
  }),
);

export const multiGateScenario = buildScenario({
  id: "edge-multiple-open-gates",
  label: "Multiple open gates scenario",
  category: "edge",
  status: "Developing",
  gateTypes: ["dangerous_operation", "slice_failure"],
  expectedComposerMode: "gate_decision",
});

export const projectionScenarios = [...statusScenarios, ...gateScenarios, multiGateScenario];

export function getProjectionScenario(id?: string): ProjectionScenario | undefined {
  return projectionScenarios.find((scenario) => scenario.id === id);
}
