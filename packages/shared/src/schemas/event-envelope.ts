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
