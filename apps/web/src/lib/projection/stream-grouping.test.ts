import { describe, expect, it } from "vitest";
import type { EventEnvelope, StreamItem } from "@oc/shared";
import { groupStreamItems } from "./stream-grouping";

function event(id: string, runId: string, agentId: string): EventEnvelope {
  return {
    eventId: id,
    seq: 1,
    schemaVersion: "1",
    projectId: "p1",
    runId,
    agentId,
    timestamp: "2026-01-01T00:00:00.000Z",
    payload: {
      type: "agent.act",
      projectId: "p1",
      agentId,
      summary: "act",
    },
  };
}

describe("stream grouping — M11", () => {
  it("groups agent items by runId and keeps user cards ungrouped", () => {
    const items: StreamItem[] = [
      {
        id: "user-1",
        origin: "user",
        kind: "user.requirement.raw",
        title: "Requirement",
        summary: "build app",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "evt-1",
        origin: "agent",
        kind: "agent.plan",
        title: "Agent plan",
        summary: "plan",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "evt-2",
        origin: "agent",
        kind: "agent.act",
        title: "Agent act",
        summary: "act",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    ];
    const events = [event("evt-1", "run-a", "planner"), event("evt-2", "run-a", "planner")];

    const grouped = groupStreamItems(items, events);
    expect(grouped.ungrouped).toHaveLength(1);
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0]?.items).toHaveLength(2);
  });
});
