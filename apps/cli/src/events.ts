import { applyEnvelopeToView } from "./projection.js";
import { resolveAgentDisplayName } from "./agents.js";
import type { RenderState } from "./render.js";
import type { EventDisplayContext, EventEnvelope, LogLine } from "./types.js";

export function createEventDisplayContext(): EventDisplayContext {
  return { toolNames: new Map() };
}

function formatAt(timestamp?: string): string {
  if (!timestamp) {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
  }
  try {
    return new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
  }
}

/** Apply envelope to structured TUI view; also returns legacy log lines for compatibility. */
export function applyEnvelope(state: RenderState, envelope: EventEnvelope): LogLine[] {
  applyEnvelopeToView(state.view, envelope, state.eventContext);
  return expandEnvelopeToLogs(envelope, state.eventContext);
}

export function expandEnvelopeToLogs(
  envelope: EventEnvelope,
  ctx: EventDisplayContext,
): LogLine[] {
  const at = formatAt(envelope.timestamp);
  const payload = envelope.payload;
  const type = payload.type;

  switch (type) {
    case "agent.started": {
      const agentId = String(payload.agentId ?? envelope.agentId ?? "agent");
      const agent = resolveAgentDisplayName(agentId);
      ctx.lastAgentId = agentId;
      ctx.lastAgentName = agent;
      return [{ at, kind: "agent", agent, agentId, phase: "started", text: "run started" }];
    }
    case "agent.plan":
    case "agent.act":
    case "agent.observe":
    case "agent.reflect": {
      const phase = type.replace("agent.", "") as LogLine["phase"];
      const agent = resolveAgentDisplayName(
        String(payload.agentId ?? envelope.agentId ?? ctx.lastAgentId),
      );
      const summary = typeof payload.summary === "string" ? payload.summary : "";
      return [{ at, kind: "reason", agent, phase, text: summary || "(no summary)" }];
    }
    default:
      return [];
  }
}
