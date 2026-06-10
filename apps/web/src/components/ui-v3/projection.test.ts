import type { ConsoleSnapshot } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { getProjectionScenario } from "@/lib/projection/scenarios";
import { adaptUiV3Projection } from "./projection";

describe("ui-v3 projection", () => {
  it("maps lifecycle and agent roster for a developing scenario", () => {
    const scenario = getProjectionScenario("gate-dangerous_operation");
    expect(scenario).toBeTruthy();
    const projection = adaptUiV3Projection(createProjectionFromSnapshot(scenario!.snapshot));
    expect(projection.agentStates).toHaveLength(12);
    expect(projection.openGates.length).toBeGreaterThan(0);
    expect(projection.lifecycle.currentStepId).not.toBe("failed");
  });

  it("offers start-development action at PRD Ready without open gates", () => {
    const scenario = getProjectionScenario("status-prd-ready");
    expect(scenario).toBeTruthy();
    const snapshot = {
      ...scenario!.snapshot,
      project: { ...scenario!.snapshot.project, status: "PRD Ready" as const },
      openGates: [],
      events: [],
    };
    const projection = adaptUiV3Projection(
      createProjectionFromSnapshot(snapshot as ConsoleSnapshot),
    );
    expect(projection.contextualActions.some((action) => action.id === "start-development")).toBe(true);
  });
});
