import {
  ConsoleSnapshotSchema,
  GATE_DEFINITIONS,
  GATE_TYPES,
  ProjectStatusSchema,
} from "@oc/shared";
import { describe, expect, it } from "vitest";
import { adaptConsoleProjection } from "@/components/ui-v2/adapter";
import { createProjectionFromSnapshot } from "./build-projection";
import { gateScenarios, multiGateScenario, statusScenarios } from "./scenarios";

describe("projection scenario matrix", () => {
  it("covers every project status with a valid renderable snapshot", () => {
    expect(statusScenarios.map((scenario) => scenario.status)).toEqual(
      ProjectStatusSchema.options,
    );

    for (const scenario of statusScenarios) {
      expect(ConsoleSnapshotSchema.safeParse(scenario.snapshot).success).toBe(true);
      const projection = createProjectionFromSnapshot(scenario.snapshot);
      const viewModel = adaptConsoleProjection(projection);

      expect(projection.composer.mode, scenario.id).toBe(scenario.expectedComposerMode);
      expect(viewModel.project.status, scenario.id).toBe(scenario.status);
      expect(viewModel.composer.mode, scenario.id).toBe(scenario.expectedComposerMode);
    }
  });

  it("covers all gate types with API-defined options", () => {
    expect(gateScenarios.map((scenario) => scenario.snapshot.openGates[0]?.gateType)).toEqual(
      GATE_TYPES,
    );

    for (const scenario of gateScenarios) {
      const gate = scenario.snapshot.openGates[0];
      expect(gate).toBeTruthy();
      if (!gate) continue;

      const definition = GATE_DEFINITIONS[gate.gateType as keyof typeof GATE_DEFINITIONS];
      expect(gate.options, scenario.id).toEqual([...definition.allowedOptions]);
      const projection = createProjectionFromSnapshot(scenario.snapshot);
      const viewModel = adaptConsoleProjection(projection);
      expect(viewModel.openGate?.id, scenario.id).toBe(gate.id);
      expect(viewModel.openGate?.options.map((option) => option.id), scenario.id).toEqual(
        gate.options,
      );
    }
  });

  it("keeps the first open gate as the blocking gate", () => {
    const projection = createProjectionFromSnapshot(multiGateScenario.snapshot);
    const [blockingGate, secondaryGate] = multiGateScenario.snapshot.openGates;

    expect(projection.openGates).toHaveLength(2);
    expect(projection.blockingGateId).toBe(blockingGate?.id);
    expect(projection.blockingGateId).not.toBe(secondaryGate?.id);
    expect(adaptConsoleProjection(projection).openGate?.type).toBe("dangerous_operation");
  });

  it("lets Paused override an otherwise blocking gate", () => {
    const paused = statusScenarios.find((scenario) => scenario.status === "Paused");
    expect(paused).toBeTruthy();
    if (!paused) return;

    const projection = createProjectionFromSnapshot(paused.snapshot);
    expect(projection.openGates).toHaveLength(1);
    expect(projection.composer.mode).toBe("paused");
    expect(projection.composer.disabled).toBe(true);
    expect(projection.composer.readOnly).toBe(true);
    expect(adaptConsoleProjection(projection).currentWork.status).toBe("interrupted");
  });
});
