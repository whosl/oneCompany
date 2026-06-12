import { z } from "zod";

const base = { projectId: z.string() };

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project.created"), ...base, name: z.string() }),
  z.object({ type: z.literal("project.status_changed"), ...base, status: z.string() }),
  z.object({
    type: z.literal("agent.started"),
    ...base,
    agentId: z.string(),
    runId: z.string(),
  }),
  z.object({
    type: z.literal("agent.prompt"),
    ...base,
    agentId: z.string(),
    system: z.string().optional(),
    human: z.string().optional(),
    text: z.string().optional(),
    sliceId: z.string().optional(),
  }),
  z.object({
    type: z.literal("agent.plan"),
    ...base,
    agentId: z.string(),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("agent.act"),
    ...base,
    agentId: z.string(),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("agent.observe"),
    ...base,
    agentId: z.string(),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("agent.reflect"),
    ...base,
    agentId: z.string(),
    summary: z.string(),
  }),
  // Ephemeral generation progress (streamed LLM tokens, throttled). Consumers
  // update live status displays; it is NOT meant for the persistent timeline.
  z.object({
    type: z.literal("agent.progress"),
    ...base,
    agentId: z.string(),
    summary: z.string(),
    charCount: z.number().optional(),
  }),
  // Raw token-stream snapshot (bypass channel): broadcast-only, never written
  // to the events table and never replayed. `text` is the accumulated tail of
  // the current generation; `streamId` changes when a new message part starts.
  z.object({
    type: z.literal("agent.stream_delta"),
    ...base,
    agentId: z.string(),
    streamId: z.string(),
    text: z.string(),
    charCount: z.number().optional(),
    done: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("agent.error"),
    ...base,
    agentId: z.string(),
    runId: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("run.failed"),
    ...base,
    agentId: z.string(),
    runId: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("tool_call.started"),
    ...base,
    toolCallId: z.string(),
    toolName: z.string(),
    /** One-line human-readable summary of the call (command, file path, …). */
    summary: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool_call.output"),
    ...base,
    toolCallId: z.string(),
    output: z.string(),
  }),
  z.object({
    type: z.literal("tool_call.failed"),
    ...base,
    toolCallId: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal("diff.created"),
    ...base,
    diffId: z.string(),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("test.result"),
    ...base,
    suite: z.string(),
    status: z.enum(["passed", "failed"]),
  }),
  z.object({
    type: z.literal("human_gate.created"),
    ...base,
    gateId: z.string(),
    gateType: z.string(),
  }),
  z.object({
    type: z.literal("human_gate.resolved"),
    ...base,
    gateId: z.string(),
    decision: z.string(),
    gateType: z.string().optional(),
  }),
  z.object({
    type: z.literal("change_request.created"),
    ...base,
    changeRequestId: z.string(),
    summary: z.string(),
    kind: z.string().optional(),
  }),
  z.object({
    type: z.literal("user.interjection"),
    ...base,
    message: z.string(),
    /** Whether the message was delivered into a live coding session. */
    delivered: z.boolean().optional(),
  }),
  // Taizi（太子）调度：用户自由输入被分类并分发到目标 agent / service。
  z.object({
    type: z.literal("taizi.routed"),
    ...base,
    message: z.string(),
    intent: z.string(),
    /** 实际执行的动作（如 "development.start", "gate.approve", "noop"） */
    action: z.string(),
    reply: z.string(),
    stateChanged: z.boolean().optional(),
    /** 客户端应自动打开的本机路径（如导出提交包目录） */
    openPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("deployment.started"),
    ...base,
  }),
  z.object({
    type: z.literal("deployment.url_confirmed"),
    ...base,
    url: z.string(),
  }),
  z.object({
    type: z.literal("deployment.completed"),
    ...base,
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal("delivery.report_generated"),
    ...base,
    artifactPath: z.string(),
  }),
  z.object({
    type: z.literal("environment.missing_key"),
    ...base,
    keyName: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("redaction.incident"),
    ...base,
    label: z.string(),
    field: z.string().optional(),
  }),
  z.object({
    type: z.literal("change_request.resolved"),
    ...base,
    changeRequestId: z.string(),
    decision: z.string(),
  }),
  z.object({
    type: z.literal("artifact.created"),
    ...base,
    artifactId: z.string(),
    path: z.string(),
  }),
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const EventEnvelopeSchema = z.object({
  eventId: z.string(),
  seq: z.number(),
  schemaVersion: z.string(),
  projectId: z.string(),
  runId: z.string().optional(),
  agentId: z.string().optional(),
  correlationId: z.string().optional(),
  timestamp: z.string(),
  payload: AgentEventSchema,
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
