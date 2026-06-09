import { describe, expect, it } from "vitest";
import type { StreamItem } from "@oc/shared";
import { buildParorSegments } from "./stream-paror";

describe("stream P/A/O/R segments — M11", () => {
  it("builds collapsible plan/act/observe segments with the last phase active", () => {
    const items: StreamItem[] = [
      {
        id: "1",
        origin: "agent",
        kind: "agent.plan",
        title: "Plan",
        summary: "plan summary",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        origin: "agent",
        kind: "agent.act",
        title: "Act",
        summary: "act summary",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "3",
        origin: "agent",
        kind: "agent.observe",
        title: "Observe",
        summary: "observe summary",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    ];

    const segments = buildParorSegments(items);
    expect(segments.map((segment) => segment.phase)).toEqual(["plan", "act", "observe"]);
    expect(segments.at(-1)?.status).toBe("active");
    expect(segments.at(-1)?.expanded).toBe(true);
    expect(segments[0]?.expanded).toBe(false);
  });
});
