import type { StreamItem } from "@oc/shared";
import type { ParorSegment, StreamRunGroup } from "./types";

const PHASE_ORDER = ["plan", "act", "observe", "reflect"] as const;

function phaseForKind(kind: string): ParorSegment["phase"] | undefined {
  if (kind === "agent.plan") return "plan";
  if (kind === "agent.act") return "act";
  if (kind === "agent.observe") return "observe";
  if (kind === "agent.reflect") return "reflect";
  return undefined;
}

export function buildParorSegments(items: StreamItem[]): ParorSegment[] {
  const segments: ParorSegment[] = [];

  for (const item of items) {
    const phase = phaseForKind(item.kind);
    if (!phase) {
      continue;
    }
    segments.push({
      id: `${item.id}-${phase}`,
      phase,
      summary: item.summary,
      status: item.kind === "agent.error" ? "failed" : "completed",
      expanded: item.kind === "agent.error",
    });
  }

  const lastPhase = segments.at(-1)?.phase;
  if (lastPhase) {
    const last = segments.find((segment) => segment.phase === lastPhase);
    if (last && last.status !== "failed") {
      last.status = "active";
      last.expanded = true;
    }
  }

  return segments.sort(
    (left, right) => PHASE_ORDER.indexOf(left.phase) - PHASE_ORDER.indexOf(right.phase),
  );
}

export function attachParorSegments(groups: StreamRunGroup[]): StreamRunGroup[] {
  return groups.map((group) => ({
    ...group,
    segments: buildParorSegments(group.items),
  }));
}
