import { describe, expect, it } from "vitest";
import {
  validAgentDefinition,
  validDevState,
  validEventEnvelope,
  validRequirementState,
} from "../test-fixtures/m0-baseline.js";
import { AgentDefinitionSchema } from "./agent-definition.js";
import { DevStateSchema } from "./dev-state.js";
import { AgentEventSchema, EventEnvelopeSchema } from "./event-envelope.js";
import {
  ProjectStatusSchema,
  STATUS_TRANSITIONS,
  type ProjectStatus,
} from "./project-status.js";
import { RequirementStateSchema } from "./requirement-state.js";

describe("shared schemas — M0 baseline", () => {
  it("parses a valid EventEnvelope fixture", () => {
    const envelope = EventEnvelopeSchema.parse(validEventEnvelope);
    expect(envelope.payload.type).toBe("project.created");
  });

  it("rejects EventEnvelope missing required fields", () => {
    const result = EventEnvelopeSchema.safeParse({
      eventId: "evt-1",
      projectId: "proj-1",
      payload: validEventEnvelope.payload,
    });
    expect(result.success).toBe(false);
  });

  it("parses a valid RequirementState fixture", () => {
    const state = RequirementStateSchema.parse(validRequirementState);
    expect(state.completenessThreshold).toBe(85);
    expect(state.maxQuestionRounds).toBe(6);
  });

  it("rejects RequirementState with invalid completeness score type", () => {
    const result = RequirementStateSchema.safeParse({
      ...validRequirementState,
      completenessScore: "not-a-number",
    });
    expect(result.success).toBe(false);
  });

  it("parses a valid DevState fixture", () => {
    const state = DevStateSchema.parse(validDevState);
    expect(state.maxSliceAttempts).toBe(4);
    expect(state.sandboxMode).toBe("local");
  });

  it("rejects DevState with invalid sandboxMode", () => {
    const result = DevStateSchema.safeParse({
      ...validDevState,
      sandboxMode: "remote",
    });
    expect(result.success).toBe(false);
  });

  it("parses a valid AgentDefinition fixture", () => {
    const agent = AgentDefinitionSchema.parse(validAgentDefinition);
    expect(agent.id).toBe("intake");
    expect(agent.group).toBe("requirement");
  });

  it("rejects AgentDefinition with invalid group", () => {
    const result = AgentDefinitionSchema.safeParse({
      ...validAgentDefinition,
      group: "ops",
    });
    expect(result.success).toBe(false);
  });

  it("lists twelve project statuses", () => {
    expect(ProjectStatusSchema.options).toHaveLength(12);
  });

  it("rejects invalid project status strings", () => {
    expect(ProjectStatusSchema.safeParse("Building").success).toBe(false);
  });

  it("maps STATUS_TRANSITIONS to every spec §3.1 status", () => {
    for (const status of ProjectStatusSchema.options) {
      expect(STATUS_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(STATUS_TRANSITIONS[status as ProjectStatus])).toBe(true);
    }
    expect(Object.keys(STATUS_TRANSITIONS)).toHaveLength(12);
  });

  it("accepts representative AgentEvent variants", () => {
    const events = [
      { type: "project.status_changed", projectId: "p", status: "Developing" },
      { type: "agent.started", projectId: "p", agentId: "a", runId: "r" },
      { type: "human_gate.resolved", projectId: "p", gateId: "g", decision: "approve" },
      { type: "change_request.created", projectId: "p", changeRequestId: "c", summary: "scope" },
      { type: "tool_call.failed", projectId: "p", toolCallId: "t", error: "x" },
    ] as const;
    for (const event of events) {
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("rejects AgentEvent with unknown type", () => {
    expect(
      AgentEventSchema.safeParse({
        type: "project.deleted",
        projectId: "p",
      }).success,
    ).toBe(false);
  });
});
