import { describe, expect, it } from "vitest";
import { AgentEventSchema, EventEnvelopeSchema } from "./event-envelope.js";
import { ProjectStatusSchema } from "./project-status.js";

describe("shared schemas", () => {
  it("parses a project.created event envelope", () => {
    const envelope = EventEnvelopeSchema.parse({
      eventId: "evt-1",
      seq: 1,
      schemaVersion: "1",
      projectId: "proj-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {
        type: "project.created",
        projectId: "proj-1",
        name: "Demo",
      },
    });
    expect(envelope.payload.type).toBe("project.created");
  });

  it("accepts all agent event variants", () => {
    const events = [
      { type: "project.status_changed", projectId: "p", status: "Developing" },
      { type: "agent.started", projectId: "p", agentId: "a", runId: "r" },
      { type: "tool_call.failed", projectId: "p", toolCallId: "t", error: "x" },
    ] as const;
    for (const event of events) {
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("lists twelve project statuses", () => {
    expect(ProjectStatusSchema.options).toHaveLength(12);
  });
});
