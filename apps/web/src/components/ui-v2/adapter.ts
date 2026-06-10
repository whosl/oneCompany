import type { EventEnvelope, StreamItem as ProjectionStreamItem } from "@oc/shared";
import type { ConsoleProjection, ParorSegment, StreamRunGroup } from "@/lib/projection/types";
import type {
  AgentGroupId,
  AgentRun,
  AgentRunGroup,
  AgentRunStatus,
  AgentStep,
  AgentStepName,
  OpenGate,
  StreamItem,
  SwimlaneRow,
  UiV2Projection,
  WorkspaceTabId,
} from "./types";
import { compactDisplaySummary } from "./display-summary";

const STEP_NAMES: AgentStepName[] = ["Plan", "Act", "Observe", "Reflect"];

function titleCase(value: string): string {
  return value
    .replace(/[@._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function agentName(agentId?: string): string {
  if (!agentId) return "System Agent";
  const base = agentId.split("@")[0] ?? agentId;
  return `${titleCase(base)} Agent`;
}

function groupForAgent(agentId?: string): AgentGroupId {
  const normalized = agentId?.toLowerCase() ?? "";
  if (normalized.includes("orchestrator") || normalized.includes("main")) return "orchestrator";
  if (
    normalized.includes("requirement") ||
    normalized.includes("intake") ||
    normalized.includes("analyst") ||
    normalized.includes("question") ||
    normalized.includes("scorer") ||
    normalized.includes("completeness") ||
    normalized.includes("prd")
  ) {
    return "requirement";
  }
  return "development";
}

function groupLabel(groupId: AgentGroupId): string {
  if (groupId === "orchestrator") return "Orchestrator";
  if (groupId === "requirement") return "Requirement Group";
  return "Development Group";
}

function stepName(phase: ParorSegment["phase"]): AgentStepName {
  return titleCase(phase) as AgentStepName;
}

function stepStatus(status: ParorSegment["status"]): AgentRunStatus {
  if (status === "active") return "running";
  return status;
}

function buildSteps(group: StreamRunGroup): AgentStep[] {
  return STEP_NAMES.map((name) => {
    const segment = group.segments.find((candidate) => stepName(candidate.phase) === name);
    return segment
      ? { name, summary: segment.summary, status: stepStatus(segment.status) }
      : { name, summary: "Pending", status: "pending" };
  });
}

function eventsForRun(events: EventEnvelope[], group: StreamRunGroup): EventEnvelope[] {
  return events.filter((event) => {
    if (event.runId) return event.runId === group.runId;
    return Boolean(group.agentId && event.agentId === group.agentId);
  });
}

function buildRun(group: StreamRunGroup, events: EventEnvelope[]): AgentRun {
  const runEvents = eventsForRun(events, group);
  const failed = runEvents.some(
    (event) => event.payload.type === "agent.error" || event.payload.type === "run.failed",
  );
  const steps = buildSteps(group);
  const currentStep =
    steps.find((step) => step.status === "running" || step.status === "failed")?.name ??
    [...steps].reverse().find((step) => step.status !== "pending")?.name ??
    "Plan";
  const latestSummary = [...group.items]
    .reverse()
    .find((item) => !item.kind.startsWith("tool_call."))?.summary;
  const groupId = groupForAgent(group.agentId);

  return {
    id: group.runId,
    agentId: group.agentId ?? group.runId,
    agentName: agentName(group.agentId),
    groupId,
    groupLabel: groupLabel(groupId),
    role: titleCase(group.agentId?.split("@")[0] ?? "agent run"),
    status: failed
      ? "failed"
      : steps.some((step) => step.status === "running")
        ? "running"
        : "completed",
    currentStep,
    summary: latestSummary ?? "Agent run recorded by the workflow.",
    steps,
    tools: runEvents
      .filter((event) => event.payload.type === "tool_call.started")
      .map((event) => (event.payload.type === "tool_call.started" ? event.payload.toolName : "")),
    diffs: runEvents
      .filter((event) => event.payload.type === "diff.created")
      .map((event) => (event.payload.type === "diff.created" ? event.payload.summary : "")),
    tests: runEvents
      .filter((event) => event.payload.type === "test.result")
      .map((event) =>
        event.payload.type === "test.result"
          ? `${event.payload.suite}: ${event.payload.status}`
          : "",
      ),
    artifacts: runEvents.flatMap((event) => {
      if (event.payload.type === "artifact.created") return [event.payload.path];
      if (event.payload.type === "delivery.report_generated") return [event.payload.artifactPath];
      return [];
    }),
    firstSeq: runEvents[0]?.seq ?? 0,
    lastSeq: runEvents.at(-1)?.seq ?? 0,
  };
}

function completeHistoricalRun(run: AgentRun): void {
  if (run.status === "failed") return;
  run.status = "completed";
  for (const step of run.steps) {
    if (step.status === "running" || step.status === "gated" || step.status === "waiting") {
      step.status = "completed";
    }
  }
}

function findGateRun(projection: ConsoleProjection, runs: AgentRun[]): AgentRun | undefined {
  const gateId = projection.blockingGateId;
  if (!gateId) return undefined;
  const gateIndex = projection.events.findIndex(
    (event) => event.payload.type === "human_gate.created" && event.payload.gateId === gateId,
  );
  const eventsBeforeGate =
    gateIndex >= 0
      ? projection.events.slice(0, gateIndex).reverse()
      : [...projection.events].reverse();

  for (const event of eventsBeforeGate) {
    const match = runs.find(
      (run) =>
        (event.runId && run.id === event.runId) ||
        (!event.runId && event.agentId && run.agentId === event.agentId),
    );
    if (match) return match;
  }
  return undefined;
}

function activateCurrentRun(run: AgentRun, gated: boolean): void {
  run.status = gated ? "gated" : "running";
  const currentStep = run.steps.find((step) => step.name === run.currentStep);
  if (currentStep) currentStep.status = gated ? "gated" : "running";
}

function interruptCurrentRun(run: AgentRun): void {
  run.status = "interrupted";
  const currentStep = run.steps.find((step) => step.name === run.currentStep);
  if (currentStep) currentStep.status = "interrupted";
}

function buildRunGroups(
  groups: UiV2Projection["groups"],
  runs: AgentRun[],
  currentRunIds: Set<string>,
): AgentRunGroup[] {
  return groups
    .map((group) => {
      const groupRuns = runs
        .filter((run) => run.groupId === group.id)
        .sort((left, right) => right.lastSeq - left.lastSeq);
      return {
        id: group.id,
        label: group.label,
        status: group.status,
        runIds: groupRuns.map((run) => run.id),
        failedCount: groupRuns.filter((run) => run.status === "failed").length,
        active: groupRuns.some((run) => currentRunIds.has(run.id)),
      };
    })
    .filter((group) => group.runIds.length > 0);
}

function workspaceTab(item: ProjectionStreamItem): WorkspaceTabId | undefined {
  const tab = item.metadata?.navigateTab;
  if (tab === "files") return "Files";
  if (tab === "tests") return "Tests";
  if (tab === "terminal") return "Terminal";
  if (tab === "report") return "Report";
  return undefined;
}

function streamType(item: ProjectionStreamItem): StreamItem["type"] {
  if (item.origin === "user") return "user";
  if (item.origin === "gate") return "gate";
  if (item.kind.startsWith("tool_call.")) return "tool";
  if (item.kind === "diff.created") return "diff";
  if (item.kind === "test.result") return "test";
  if (item.kind === "artifact.created" || item.kind === "delivery.report_generated") {
    return "artifact";
  }
  if (item.kind.startsWith("agent.")) return "agent-run";
  return "orchestrator";
}

function severity(item: ProjectionStreamItem): StreamItem["severity"] {
  if (
    item.kind === "agent.error" ||
    item.kind === "run.failed" ||
    item.kind === "tool_call.failed"
  ) {
    return "danger";
  }
  if (item.origin === "gate" || item.kind === "environment.missing_key") return "warning";
  if (
    item.kind === "test.result" ||
    item.kind === "deployment.completed" ||
    item.kind === "delivery.report_generated"
  ) {
    return "success";
  }
  return "neutral";
}

function formatTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildOpenGate(projection: ConsoleProjection): OpenGate | undefined {
  const gate = projection.openGates.find((candidate) => candidate.id === projection.blockingGateId);
  if (!gate) return undefined;

  return {
    id: gate.id,
    type: gate.gateType,
    title: titleCase(gate.gateType),
    description: projection.composer.reason,
    risk: gate.gateType === "dangerous_operation" ? "high" : "medium",
    command: "",
    options: gate.options.map((option, index) => ({
      id: option,
      label: titleCase(option),
      tone:
        option.includes("fail") || option.includes("reject")
          ? "danger"
          : index === 0
            ? "primary"
            : "secondary",
    })),
  };
}

function buildSwimlaneRows(runs: AgentRun[]): SwimlaneRow[] {
  return runs.map((run) => ({
    id: run.id,
    groupId: run.groupId,
    agentName: run.agentName.replace(/ Agent$/, ""),
    role: run.groupLabel,
    status: run.status,
    cells: run.steps.map((step) => {
      const current = step.name === run.currentStep;
      const links: WorkspaceTabId[] = current
        ? [
            ...(run.tools.length ? (["Terminal"] as const) : []),
            ...(run.diffs.length ? (["Files"] as const) : []),
            ...(run.tests.length ? (["Tests"] as const) : []),
            ...(run.artifacts.length ? (["Report"] as const) : []),
          ]
        : [];
      return {
        agentId: run.agentId,
        step: step.name,
        summary: compactDisplaySummary(step.summary),
        fullSummary: step.summary,
        status: step.status,
        runId: run.id,
        chips: [
          ...(run.tools.length && current ? ["tool"] : []),
          ...(run.diffs.length && current ? ["diff"] : []),
          ...(run.tests.length && current ? ["test"] : []),
          ...(run.artifacts.length && current ? ["report"] : []),
          ...(run.status === "gated" && current ? ["gate"] : []),
          ...(run.status === "interrupted" && current ? ["paused"] : []),
        ],
        links: [...new Set(links)],
        firstSeq: run.firstSeq,
        lastSeq: run.lastSeq,
      };
    }),
  }));
}

export function adaptConsoleProjection(projection: ConsoleProjection): UiV2Projection {
  const runs = projection.streamGroups.map((group) => buildRun(group, projection.events));
  const openGate = buildOpenGate(projection);
  const projectPaused = projection.snapshot.project.status === "Paused";
  const projectCanRun = !["Delivered", "Failed", "Paused"].includes(
    projection.snapshot.project.status,
  );
  const latestRun = [...runs]
    .filter((run) => run.status !== "failed")
    .sort((left, right) => right.lastSeq - left.lastSeq)[0];
  const activeRun = findGateRun(projection, runs) ?? latestRun;

  for (const run of runs) {
    if (run.id !== activeRun?.id) completeHistoricalRun(run);
  }
  if (activeRun && projectCanRun) {
    activateCurrentRun(activeRun, Boolean(openGate));
  } else if (activeRun && projectPaused) {
    interruptCurrentRun(activeRun);
  }

  const groupStatuses = new Map<AgentGroupId, AgentRunStatus>();
  for (const groupId of ["orchestrator", "requirement", "development"] as const) {
    const groupRuns = runs.filter((run) => run.groupId === groupId);
    const status =
      groupRuns.find((run) => run.status === "gated")?.status ??
      groupRuns.find((run) => run.status === "interrupted")?.status ??
      groupRuns.find((run) => run.status === "failed")?.status ??
      groupRuns.find((run) => run.status === "running")?.status ??
      (groupRuns.length ? "completed" : "pending");
    groupStatuses.set(groupId, status);
  }

  const timelineRunId = new Map(
    projection.streamGroups.flatMap((group) =>
      group.items.map((item) => [item.id, group.runId] as const),
    ),
  );
  const reportArtifacts = projection.events.flatMap((event) =>
    event.payload.type === "delivery.report_generated" ? [event.payload.artifactPath] : [],
  );
  const testsBySuite = new Map<string, UiV2Projection["tests"][number]>();
  const filesByPath = new Map<string, UiV2Projection["files"][number]>();
  const eventSeqById = new Map(projection.events.map((event) => [event.eventId, event.seq]));

  for (const event of projection.events) {
    if (event.payload.type === "test.result") {
      testsBySuite.set(event.payload.suite, {
        name: event.payload.suite,
        detail: `Latest event #${event.seq}`,
        status: event.payload.status,
        linkedRunId: event.runId,
      });
    }
    if (event.payload.type === "artifact.created") {
      filesByPath.set(event.payload.path, { path: event.payload.path, status: "artifact" });
    }
    if (event.payload.type === "diff.created") {
      filesByPath.set(event.payload.summary, {
        path: event.payload.summary,
        status: "changed",
      });
    }
  }

  const groups: UiV2Projection["groups"] = [
    {
      id: "orchestrator",
      label: "Orchestrator Agent",
      summary: "Coordinates user intent, gates, and child agent handoffs.",
      status: groupStatuses.get("orchestrator") ?? "pending",
    },
    {
      id: "requirement",
      label: "Requirement Group",
      summary: "Clarifies requirements and prepares the confirmed product contract.",
      status: groupStatuses.get("requirement") ?? "pending",
    },
    {
      id: "development",
      label: "Development Group",
      summary: "Plans, implements, tests, and prepares delivery artifacts.",
      status: groupStatuses.get("development") ?? "pending",
    },
  ];
  const latestFailedRun = [...runs]
    .filter((run) => run.status === "failed" && run.id !== activeRun?.id)
    .sort((left, right) => right.lastSeq - left.lastSeq)[0];
  const currentRunIds = [activeRun?.id, latestFailedRun?.id].filter((runId): runId is string =>
    Boolean(runId),
  );
  const currentRunIdSet = new Set(currentRunIds);

  return {
    source: "live",
    project: {
      name: projection.snapshot.project.name,
      slug: projection.snapshot.project.slug,
      status: projection.snapshot.project.status,
      pausedFrom: projection.snapshot.pausedFrom,
      activeGroup: projection.snapshot.phase.activeGroup,
      progress: projection.snapshot.phase.progressLabel ?? projection.snapshot.phase.label,
    },
    composer: { ...projection.composer },
    orchestration: {
      orchestratorStatus: projectPaused
        ? "interrupted"
        : openGate
          ? "gated"
          : (activeRun?.status ?? "pending"),
      activeGroup: projection.snapshot.phase.activeGroup,
      activeAgent: activeRun?.agentName ?? "Orchestrator Agent",
      unit:
        projection.snapshot.dev?.sliceTotal != null
          ? `Slice ${projection.snapshot.dev.sliceIndex + 1} / ${projection.snapshot.dev.sliceTotal}`
          : (projection.snapshot.phase.progressLabel ?? projection.snapshot.phase.label),
      phase: openGate ? "Gate" : (activeRun?.currentStep ?? "Plan"),
      blocker: openGate?.type ?? "none",
      nextAction: projection.composer.reason,
    },
    requirementSnapshot: {
      raw: projection.snapshot.requirement?.rawRequirement ?? "No requirement submitted yet.",
      normalized:
        projection.snapshot.requirement?.normalizedSummary ??
        "Waiting for the initial requirement.",
      score: projection.snapshot.requirement?.completenessScore ?? 0,
      facts: projection.snapshot.requirement?.settledChips ?? [],
      upcoming: projection.snapshot.requirement?.upcomingChips ?? [],
    },
    groups,
    runs,
    currentWork: {
      primaryRunId: activeRun?.id,
      relatedRunIds: currentRunIds,
      gateId: openGate?.id,
      status: projectPaused
        ? "interrupted"
        : openGate
          ? "gated"
          : (activeRun?.status ?? "pending"),
      summary: projection.composer.reason,
    },
    runGroups: buildRunGroups(groups, runs, currentRunIdSet),
    streamItems: projection.timeline
      .flatMap((item) => {
        const seq = eventSeqById.get(item.id);
        if (seq == null) return [];
        return [
          {
            id: item.id,
            seq,
            type: streamType(item),
            title: item.title,
            summary: item.summary,
            timestamp: formatTime(item.timestamp),
            runId: timelineRunId.get(item.id),
            tab: workspaceTab(item),
            severity: severity(item),
          },
        ];
      })
      .sort((left, right) => left.seq - right.seq),
    swimlaneRows: buildSwimlaneRows(runs),
    openGate,
    tests: [...testsBySuite.values()],
    files: [...filesByPath.values()],
    previewUrl: projection.snapshot.dev?.previewUrl ?? projection.snapshot.testing?.previewUrl,
    terminalItems: projection.events.flatMap((event) => {
      if (event.payload.type === "tool_call.started") {
        return [{ title: event.payload.toolName, summary: "Tool call started" }];
      }
      if (event.payload.type === "tool_call.output") {
        return [
          { title: `Tool output ${event.payload.toolCallId}`, summary: event.payload.output },
        ];
      }
      if (event.payload.type === "tool_call.failed") {
        return [{ title: `Tool failed ${event.payload.toolCallId}`, summary: event.payload.error }];
      }
      return [];
    }),
    reportArtifacts: [...new Set(reportArtifacts)],
  };
}
