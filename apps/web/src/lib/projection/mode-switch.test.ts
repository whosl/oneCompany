import { describe, expect, it } from "vitest";
import type { ConsoleSnapshot } from "@oc/shared";
import {
  createProjectionFromSnapshot,
  projectionDataFingerprint,
} from "./build-projection";

const snapshot: ConsoleSnapshot = {
  project: {
    id: "p1",
    name: "Demo",
    slug: "demo",
    status: "Asking Questions",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  phase: {
    label: "Asking Questions",
    activeGroup: "Requirement Group",
    progressLabel: "Completeness 72",
  },
  requirement: {
    rawRequirement: "Build a todo app",
    normalizedSummary: "Todo app for teams",
    completenessScore: 72,
    completenessLocked: false,
    settledChips: [],
    upcomingChips: ["Who logs in?"],
  },
  risks: [],
  openGates: [],
  events: [],
  lastSeq: 0,
};

describe("mode switch — M9", () => {
  it("keeps the same underlying data for stream and swimlane views", () => {
    const projection = createProjectionFromSnapshot(snapshot);
    const fingerprint = projectionDataFingerprint(projection);

    const streamUserVisible = projection.streamItems.some((item) =>
      item.summary.includes("todo"),
    );
    const swimlaneUserVisible = projection.swimlane.some((cell) => cell.agentId === "user");

    expect(streamUserVisible).toBe(true);
    expect(swimlaneUserVisible).toBe(true);

    const refingerprint = projectionDataFingerprint({
      ...projection,
      streamItems: [...projection.streamItems],
      swimlane: [...projection.swimlane],
    });
    expect(refingerprint).toBe(fingerprint);
  });
});
