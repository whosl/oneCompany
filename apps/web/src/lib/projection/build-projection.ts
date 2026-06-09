import type {
  AgentEvent,
  ConsoleSnapshot,
  EventEnvelope,
  StreamItem,
  SwimlaneCell,
} from "@oc/shared";
import { attachParorSegments } from "./stream-paror.js";
import { groupStreamItems } from "./stream-grouping.js";
import type { AgentProjection, ConsoleProjection } from "./types";

const LARGE_OUTPUT_THRESHOLD = 500;

export function createProjectionFromSnapshot(snapshot: ConsoleSnapshot): ConsoleProjection {
  let projection: ConsoleProjection = {
    snapshot,
    events: [...snapshot.events],
    openGates: [...snapshot.openGates],
    blockingGateId: snapshot.openGates[0]?.id,
    agents: {},
    streamItems: [],
    streamGroups: [],
    ungroupedStreamItems: [],
    swimlane: [],
    lastSeq: snapshot.lastSeq,
  };

  for (const event of snapshot.events) {
    projection = applyEvent(projection, event);
  }

  projection.streamItems = deriveStreamItems(projection);
  const grouped = groupStreamItems(projection.streamItems, projection.events);
  projection.ungroupedStreamItems = grouped.ungrouped;
  projection.streamGroups = attachParorSegments(grouped.groups);
  projection.swimlane = deriveSwimlane(projection);
  return projection;
}

export function applyEvent(projection: ConsoleProjection, envelope: EventEnvelope): ConsoleProjection {
  const events = [...projection.events, envelope];
  const agents = { ...projection.agents };
  const openGates = [...projection.openGates];
  const payload = envelope.payload;

  updateAgents(agents, envelope, payload);
  updateGates(openGates, payload);

  const next: ConsoleProjection = {
    ...projection,
    events,
    agents,
    openGates,
    // The first open gate is the single emphasized blocking gate; when none are
    // open this clears so the composer leaves the gate-blocked state.
    blockingGateId: openGates[0]?.id,
    lastSeq: envelope.seq,
  };

  next.streamItems = deriveStreamItems(next);
  const grouped = groupStreamItems(next.streamItems, next.events);
  next.ungroupedStreamItems = grouped.ungrouped;
  next.streamGroups = attachParorSegments(grouped.groups);
  next.swimlane = deriveSwimlane(next);
  return next;
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

function updateGates(
  openGates: ConsoleProjection["openGates"],
  payload: AgentEvent,
): void {
  if (payload.type === "human_gate.created") {
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
      items.push({
        id: event.eventId,
        origin: "gate",
        kind: payload.type,
        title: `Gate: ${payload.gateType}`,
        summary: gate ? "Awaiting decision" : "Gate resolved",
        timestamp: event.timestamp,
        metadata: { gateId: payload.gateId, gateType: payload.gateType },
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
      if (payload.type === "agent.reflect" || payload.type === "agent.started") {
        continue;
      }
      items.push({
        id: event.eventId,
        origin: "agent",
        kind: payload.type,
        title: payload.type.replace("agent.", "Agent "),
        summary: "summary" in payload ? String(payload.summary) : payload.type,
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
