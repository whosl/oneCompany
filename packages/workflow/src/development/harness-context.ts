import type { DevContext } from "@oc/agent-core";
import { emit, type AgentEvent, type DevState } from "@oc/shared";
import { persistOutput } from "@oc/workspace";
import type { DevelopmentWorkflowDeps } from "./types.js";

const HARNESS_AGENT_ID = "opencode";

function toAgentEvent(projectId: string, raw: unknown): AgentEvent | null {
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    return null;
  }

  const event = raw as Record<string, unknown>;
  const type = event.type;
  if (typeof type !== "string") {
    return null;
  }

  const base = { projectId, agentId: HARNESS_AGENT_ID };

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
    emit: (raw) => {
      const payload = toAgentEvent(state.projectId, raw);
      if (!payload) {
        return;
      }
      const envelope = emit(deps.db, {
        projectId: state.projectId,
        agentId: HARNESS_AGENT_ID,
        payload,
      });
      deps.onEvent?.(envelope);
    },
    authorize: deps.authorize,
  };
}
