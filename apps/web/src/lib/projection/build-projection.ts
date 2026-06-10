import type {
  AgentEvent,
  ConsoleSnapshot,
  EventEnvelope,
  StreamItem,
  SwimlaneCell,
} from "@oc/shared";
import {
  formatIntegrationGateReason,
  formatIntegrationGateSummary,
  formatIntegrationToolLabel,
  getGatePresentation,
} from "../gate-presentations.js";
import { attachParorSegments } from "./stream-paror";
import { groupStreamItems } from "./stream-grouping";
import type { AgentProjection, ComposerProjection, ConsoleProjection } from "./types";

const LARGE_OUTPUT_THRESHOLD = 500;

export function createProjectionFromSnapshot(snapshot: ConsoleSnapshot): ConsoleProjection {
  let projection: ConsoleProjection = {
    snapshot,
    events: [],
    openGates: [...snapshot.openGates],
    blockingGateId: snapshot.openGates[0]?.id,
    composer: deriveComposer(snapshot, snapshot.openGates[0]?.id),
    timeline: [],
    agents: {},
    streamItems: [],
    streamGroups: [],
    ungroupedStreamItems: [],
    swimlane: [],
    lastSeq: snapshot.lastSeq,
  };

  for (const event of [...snapshot.events].sort((left, right) => left.seq - right.seq)) {
    projection = applyEvent(projection, event);
  }

  return rebuildDerivedProjection({
    ...projection,
    lastSeq: Math.max(projection.lastSeq, snapshot.lastSeq),
  });
}

export function applyEvent(
  projection: ConsoleProjection,
  envelope: EventEnvelope,
): ConsoleProjection {
  const existing = projection.events.some((event) => event.eventId === envelope.eventId);
  const events = existing
    ? projection.events
    : [...projection.events, envelope].sort((left, right) => left.seq - right.seq);
  const agents = { ...projection.agents };
  const openGates = [...projection.openGates];
  const payload = envelope.payload;

  if (!existing) {
    updateAgents(agents, envelope, payload);
    updateGates(openGates, payload);
  }

  const blockingGateId = openGates[0]?.id;

  const next: ConsoleProjection = {
    ...projection,
    events,
    agents,
    openGates,
    // The first open gate is the single emphasized blocking gate; when none are
    // open this clears so the composer leaves the gate-blocked state.
    blockingGateId,
    composer: deriveComposer(projection.snapshot, blockingGateId),
    lastSeq: Math.max(projection.lastSeq, envelope.seq),
  };

  return rebuildDerivedProjection(next);
}

function rebuildDerivedProjection(projection: ConsoleProjection): ConsoleProjection {
  const streamItems = deriveStreamItems(projection);
  const grouped = groupStreamItems(streamItems, projection.events);
  return {
    ...projection,
    composer: deriveComposer(projection.snapshot, projection.blockingGateId),
    timeline: streamItems,
    streamItems,
    ungroupedStreamItems: grouped.ungrouped,
    streamGroups: attachParorSegments(grouped.groups),
    swimlane: deriveSwimlane({ ...projection, streamItems }),
  };
}

export function deriveComposer(
  snapshot: ConsoleSnapshot,
  blockingGateId?: string,
): ComposerProjection {
  const status = snapshot.project.status;
  const blockingGate = snapshot.openGates.find((gate) => gate.id === blockingGateId);

  if (status === "Paused") {
    return {
      mode: "paused",
      blockingGateId,
      disabled: true,
      readOnly: true,
      reason: snapshot.pausedFrom
        ? `Project is paused. Resume returns to ${snapshot.pausedFrom}.`
        : "Project is paused.",
    };
  }

  if (status === "Delivered" || status === "Failed") {
    return {
      mode: "read_only",
      blockingGateId,
      disabled: true,
      readOnly: true,
      reason: status === "Delivered" ? "Project is delivered." : "Project failed.",
    };
  }

  if (blockingGate) {
    return {
      mode: blockingGate.gateType === "deployment" ? "deployment_url" : "gate_decision",
      blockingGateId,
      disabled: false,
      readOnly: false,
      reason:
        formatIntegrationGateReason(blockingGate.metadata) ??
        `Resolve ${blockingGate.gateType} to continue.`,
    };
  }

  if (status === "Asking Questions" && snapshot.requirement?.pendingQuestions?.length) {
    return {
      mode: "question_round",
      disabled: false,
      readOnly: false,
      reason: "Answer the current requirement question round.",
    };
  }

  if (status === "Developing" || status === "Testing") {
    return {
      mode: "change_request",
      disabled: false,
      readOnly: false,
      reason: "Submit a requirement change for review.",
    };
  }

  if (status === "Draft Requirement") {
    return {
      mode: "requirement",
      disabled: false,
      readOnly: false,
      reason: "Describe the product requirement.",
    };
  }

  return {
    mode: "read_only",
    disabled: true,
    readOnly: true,
    reason: `${status} is waiting for workflow events or gates.`,
  };
}

function updateAgents(
  agents: Record<string, AgentProjection>,
  envelope: EventEnvelope,
  payload: AgentEvent,
): void {
  const agentId = envelope.agentId ?? ("agentId" in payload ? payload.agentId : undefined);
  if (!agentId) {
    return;
  }

  const current = agents[agentId] ?? { agentId };
  if (payload.type === "agent.plan") {
    current.latestPlan = payload.summary;
  }
  if (payload.type === "agent.act") {
    current.latestAct = payload.summary;
  }
  if (payload.type === "agent.observe") {
    current.latestObserve = payload.summary;
  }
  if (payload.type === "agent.reflect") {
    current.latestReflect = payload.summary;
  }
  if (payload.type === "agent.started") {
    current.activeRunId = payload.runId;
    current.failed = false;
  }
  if (payload.type === "agent.error" || payload.type === "run.failed") {
    current.failed = true;
  }
  agents[agentId] = current;
}

function updateGates(openGates: ConsoleProjection["openGates"], payload: AgentEvent): void {
  if (payload.type === "human_gate.created") {
    if (openGates.some((gate) => gate.id === payload.gateId)) {
      return;
    }
    // Live gate events do not carry the allowed options (those live in the
    // snapshot), so this is a placeholder until the hook re-hydrates.
    openGates.push({
      id: payload.gateId,
      gateType: payload.gateType,
      status: "open",
      options: [],
      decision: null,
      createdAt: new Date().toISOString(),
    });
  }
  if (payload.type === "human_gate.resolved") {
    const index = openGates.findIndex((gate) => gate.id === payload.gateId);
    if (index >= 0) {
      openGates.splice(index, 1);
    }
  }
}

export function deriveStreamItems(projection: ConsoleProjection): StreamItem[] {
  const items: StreamItem[] = [];
  const { snapshot } = projection;

  if (snapshot.requirement?.rawRequirement) {
    items.push({
      id: "user-requirement-raw",
      origin: "user",
      kind: "user.requirement.raw",
      title: "Your requirement",
      summary: snapshot.requirement.rawRequirement,
      timestamp: snapshot.project.createdAt,
    });
  }

  if (
    snapshot.requirement?.normalizedSummary &&
    snapshot.requirement.normalizedSummary !== snapshot.requirement.rawRequirement
  ) {
    items.push({
      id: "user-requirement-normalized",
      origin: "system",
      kind: "user.requirement.normalized",
      title: "Normalized requirement",
      summary: snapshot.requirement.normalizedSummary,
      timestamp: snapshot.project.updatedAt,
    });
  }

  for (const event of projection.events) {
    const payload = event.payload;
    if (payload.type === "human_gate.created") {
      const gate = projection.openGates.find((g) => g.id === payload.gateId);
      const presentation = getGatePresentation(payload.gateType);
      const integrationLabel = formatIntegrationToolLabel(gate?.metadata);
      items.push({
        id: event.eventId,
        origin: "gate",
        kind: payload.type,
        title: integrationLabel
          ? `Gate: ${integrationLabel}`
          : `Gate: ${presentation.title}`,
        summary: gate
          ? formatIntegrationGateSummary(gate.metadata)
          : "Gate resolved",
        timestamp: event.timestamp,
        metadata: {
          gateId: payload.gateId,
          gateType: payload.gateType,
          integrationId: gate?.metadata?.integrationId,
          toolName: gate?.metadata?.toolName,
          caller: gate?.metadata?.caller,
          gateTitle: presentation.title,
        },
        expanded: projection.blockingGateId === payload.gateId,
      });
      continue;
    }

    if (payload.type === "human_gate.resolved") {
      items.push({
        id: event.eventId,
        origin: "gate",
        kind: payload.type,
        title: "Gate resolved",
        summary: payload.decision,
        timestamp: event.timestamp,
        expanded: false,
      });
      continue;
    }

    if (payload.type.startsWith("agent.")) {
      const title =
        payload.type === "agent.started"
          ? "Agent started"
          : payload.type === "agent.error"
            ? "Agent error"
            : payload.type.replace("agent.", "Agent ");
      const summary =
        payload.type === "agent.started"
          ? payload.agentId
          : payload.type === "agent.error"
            ? payload.message
            : "summary" in payload
              ? String(payload.summary)
              : payload.type;
      items.push({
        id: event.eventId,
        origin: "agent",
        kind: payload.type,
        title,
        summary,
        timestamp: event.timestamp,
        metadata: { agentId: event.agentId },
        expanded: payload.type === "agent.error",
      });
      continue;
    }

    if (payload.type === "tool_call.started") {
      items.push({
        id: event.eventId,
        origin: "agent",
        kind: payload.type,
        title: payload.toolName,
        summary: "Tool call started",
        timestamp: event.timestamp,
        metadata: {
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
        },
        expanded: false,
      });
      continue;
    }

    if (payload.type === "tool_call.output" || payload.type === "tool_call.failed") {
      const output = payload.type === "tool_call.output" ? payload.output : payload.error;
      const large = output.length > LARGE_OUTPUT_THRESHOLD;
      items.push({
        id: event.eventId,
        origin: "agent",
        kind: "tool_call.result",
        title: payload.type === "tool_call.failed" ? "Tool call failed" : "Tool output",
        summary: large ? `${output.slice(0, 120)}…` : output,
        timestamp: event.timestamp,
        metadata: {
          large,
          toolCallId: payload.toolCallId,
          toolName: payload.type === "tool_call.failed" ? "failed" : "output",
          navigateTab: large ? "terminal" : undefined,
          artifactPath: large ? `logs/cmd-${payload.toolCallId}.log` : undefined,
        },
        expanded: false,
      });
      continue;
    }

    if (payload.type === "diff.created") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Diff created",
        summary: payload.summary,
        timestamp: event.timestamp,
        metadata: { diffId: payload.diffId, navigateTab: "files" },
      });
      continue;
    }

    if (payload.type === "test.result") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: `Test ${payload.suite}`,
        summary: payload.status,
        timestamp: event.timestamp,
        metadata: { suite: payload.suite, navigateTab: "tests" },
      });
      continue;
    }

    if (payload.type === "run.failed") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Run failed",
        summary: payload.reason,
        timestamp: event.timestamp,
        metadata: { agentId: payload.agentId, runId: payload.runId },
        expanded: true,
      });
      continue;
    }

    if (payload.type === "project.status_changed") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Status changed",
        summary: payload.status,
        timestamp: event.timestamp,
        expanded: true,
      });
      continue;
    }

    if (payload.type === "change_request.created") {
      items.push({
        id: event.eventId,
        origin: "user",
        kind: payload.type,
        title: "Change request",
        summary: payload.summary,
        timestamp: event.timestamp,
        metadata: { changeRequestId: payload.changeRequestId, kind: payload.kind },
        expanded: true,
      });
      continue;
    }

    if (payload.type === "change_request.resolved") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Change request resolved",
        summary: payload.decision,
        timestamp: event.timestamp,
        metadata: { changeRequestId: payload.changeRequestId },
      });
      continue;
    }

    if (payload.type === "deployment.started") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Deployment started",
        summary: "Waiting for deployment URL confirmation.",
        timestamp: event.timestamp,
      });
      continue;
    }

    if (payload.type === "deployment.url_confirmed") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Deployment URL confirmed",
        summary: payload.url,
        timestamp: event.timestamp,
        metadata: { url: payload.url },
      });
      continue;
    }

    if (payload.type === "deployment.completed") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Deployment completed",
        summary: payload.url ?? "Deployment completed.",
        timestamp: event.timestamp,
        metadata: { url: payload.url },
      });
      continue;
    }

    if (payload.type === "delivery.report_generated") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Delivery report generated",
        summary: payload.artifactPath,
        timestamp: event.timestamp,
        metadata: { artifactPath: payload.artifactPath, navigateTab: "report" },
      });
      continue;
    }

    if (payload.type === "artifact.created") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: "Artifact created",
        summary: payload.path,
        timestamp: event.timestamp,
        metadata: {
          artifactId: payload.artifactId,
          artifactPath: payload.path,
          navigateTab: "files",
        },
      });
      continue;
    }

    if (payload.type === "environment.missing_key") {
      items.push({
        id: event.eventId,
        origin: "system",
        kind: payload.type,
        title: `Missing ${payload.keyName}`,
        summary: payload.message,
        timestamp: event.timestamp,
        expanded: true,
      });
    }
  }

  if (snapshot.requirement?.pendingQuestions?.length) {
    for (const [index, item] of snapshot.requirement.pendingQuestions.entries()) {
      items.push({
        id: `pending-question-${index}`,
        origin: "system",
        kind: "requirement.question",
        title: `Question ${index + 1}`,
        summary: item.question,
        timestamp: snapshot.project.updatedAt,
        metadata: {
          questionIndex: index,
          suggestedAnswers: item.suggestedAnswers,
        },
        expanded: true,
      });
    }
  }

  return items;
}

export function deriveSwimlane(projection: ConsoleProjection): SwimlaneCell[] {
  const cells: SwimlaneCell[] = [];

  if (projection.snapshot.requirement?.rawRequirement) {
    cells.push({
      agentId: "user",
      phase: "user",
      summary: "Requirement submitted",
      status: "completed",
    });
  }

  for (const gate of projection.openGates) {
    cells.push({
      agentId: "gate",
      phase: "gate",
      summary: gate.gateType,
      status: "active",
    });
  }

  for (const agent of Object.values(projection.agents)) {
    const status: SwimlaneCell["status"] = agent.failed ? "failed" : "completed";
    if (agent.latestPlan) {
      cells.push({ agentId: agent.agentId, phase: "plan", summary: agent.latestPlan, status });
    }
    if (agent.latestAct) {
      cells.push({ agentId: agent.agentId, phase: "act", summary: agent.latestAct, status });
    }
    if (agent.latestObserve) {
      cells.push({
        agentId: agent.agentId,
        phase: "observe",
        summary: agent.latestObserve,
        status,
      });
    }
    if (agent.latestReflect) {
      cells.push({
        agentId: agent.agentId,
        phase: "reflect",
        summary: agent.latestReflect,
        status,
      });
    }
  }

  return cells;
}

export function projectionDataFingerprint(projection: ConsoleProjection): string {
  return JSON.stringify({
    events: projection.events.map((event) => event.eventId),
    stream: projection.streamItems.map((item) => item.id),
    swimlane: projection.swimlane.map((cell) => `${cell.agentId}:${cell.phase}`),
    blockingGateId: projection.blockingGateId,
  });
}
