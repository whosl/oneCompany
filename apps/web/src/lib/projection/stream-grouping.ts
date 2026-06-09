import type { EventEnvelope, StreamItem } from "@oc/shared";
import type { StreamRunGroup } from "./types";

const UNGROUPED_KINDS = new Set([
  "user.requirement.raw",
  "user.requirement.normalized",
  "human_gate.created",
  "human_gate.resolved",
  "requirement.question",
]);

function runKeyForEvent(event: EventEnvelope): string | undefined {
  if (event.runId) {
    return event.runId;
  }
  if (event.agentId) {
    return `${event.agentId}:ungrouped`;
  }
  return undefined;
}

export function groupStreamItems(
  streamItems: StreamItem[],
  events: EventEnvelope[],
): { ungrouped: StreamItem[]; groups: StreamRunGroup[] } {
  const eventById = new Map(events.map((event) => [event.eventId, event]));
  const ungrouped: StreamItem[] = [];
  const groupMap = new Map<string, StreamRunGroup>();

  for (const item of streamItems) {
    if (UNGROUPED_KINDS.has(item.kind) || item.origin === "user" || item.origin === "gate") {
      ungrouped.push(item);
      continue;
    }

    const event = eventById.get(item.id);
    const runKey = event ? runKeyForEvent(event) : undefined;
    if (!runKey) {
      ungrouped.push(item);
      continue;
    }

    const existing = groupMap.get(runKey);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    groupMap.set(runKey, {
      id: `run-${runKey}`,
      runId: event?.runId ?? runKey,
      agentId: event?.agentId,
      items: [item],
      segments: [],
      collapsed: false,
    });
  }

  return { ungrouped, groups: [...groupMap.values()] };
}
