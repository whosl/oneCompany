import type { DevContext } from "@oc/agent-core";
import { emit, ephemeralEnvelope, type AgentEvent, type DevState } from "@oc/shared";
import { classifyCommandChain, persistOutput } from "@oc/workspace";
import type { DevelopmentWorkflowDeps } from "./types.js";

/**
 * Default attribution for harness events. The opencode engine is an
 * implementation detail — events surface under the pipeline role that drives
 * it ("coding" for slice implementation, "review" for code review).
 */
const DEFAULT_HARNESS_AGENT_ID = "coding";

function toAgentEvent(projectId: string, agentId: string, raw: unknown): AgentEvent | null {
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    return null;
  }

  const event = raw as Record<string, unknown>;
  const type = event.type;
  if (typeof type !== "string") {
    return null;
  }

  const base = { projectId, agentId };

  switch (type) {
    case "agent.plan":
    case "agent.act":
    case "agent.observe":
    case "agent.reflect":
      return {
        type,
        ...base,
        summary: typeof event.summary === "string" ? event.summary : "",
      };
    case "tool_call.started":
      return {
        type,
        projectId,
        toolCallId: String(event.toolCallId ?? ""),
        toolName: String(event.toolName ?? "tool"),
        summary: typeof event.summary === "string" ? event.summary : undefined,
      };
    case "tool_call.output":
      return {
        type,
        projectId,
        toolCallId: String(event.toolCallId ?? ""),
        output: typeof event.output === "string" ? event.output : "",
      };
    case "tool_call.failed":
      return {
        type,
        projectId,
        toolCallId: String(event.toolCallId ?? ""),
        error: typeof event.error === "string" ? event.error : "tool failed",
      };
    default:
      return null;
  }
}

export function buildHarnessContext(
  deps: DevelopmentWorkflowDeps,
  state: DevState,
  agentId: string = DEFAULT_HARNESS_AGENT_ID,
): DevContext {
  const formatToolOutput =
    deps.logsPath &&
    ((toolCallId: string, raw: string) => {
      const ref = persistOutput(
        {
          db: deps.db,
          projectId: state.projectId,
          logsPath: deps.logsPath!,
          toolCallId,
        },
        raw,
      );
      return ref.kind === "inline" ? ref.text : ref.summary;
    });

  return {
    repoPath: deps.repoPath,
    projectId: state.projectId,
    logsPath: deps.logsPath,
    formatToolOutput: formatToolOutput || undefined,
    classifyShellRisk: (command) =>
      deps.classifyShellRisk?.(command) ??
      classifyCommandChain(command, { repoPath: deps.repoPath }),
    runGovernedCommand: deps.runGovernedCommand,
    emit: (raw) => {
      // Bypass channel: token-stream snapshots are broadcast-only — building
      // an envelope without touching the events table keeps the DB out of the
      // hot path (these fire every ~250ms during generation).
      const rawEvent = raw as Record<string, unknown> | null;
      if (rawEvent && rawEvent.type === "agent.stream_delta") {
        try {
          const envelope = ephemeralEnvelope({
            projectId: state.projectId,
            agentId,
            payload: {
              type: "agent.stream_delta",
              projectId: state.projectId,
              agentId,
              streamId: String(rawEvent.streamId ?? "stream"),
              text: typeof rawEvent.text === "string" ? rawEvent.text : "",
              charCount:
                typeof rawEvent.charCount === "number" ? rawEvent.charCount : undefined,
              done: rawEvent.done === true ? true : undefined,
            },
          });
          deps.onEvent?.(envelope);
        } catch {
          // Streaming is best-effort; never break the harness over it.
        }
        return;
      }
      const payload = toAgentEvent(state.projectId, agentId, raw);
      if (!payload) {
        return;
      }
      const envelope = emit(deps.db, {
        projectId: state.projectId,
        agentId,
        payload,
      });
      deps.onEvent?.(envelope);
    },
    authorize: deps.authorize,
  };
}
