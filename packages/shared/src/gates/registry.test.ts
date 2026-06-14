import { describe, expect, it } from "vitest";
import { GATE_DEFINITIONS, getGateDefinition } from "./registry.js";
import { gateTypeForbidsSkipRisk } from "./policy.js";
import { GATE_TYPES } from "./types.js";

describe("gate registry — M4", () => {
  it("defines every declared gate type", () => {
    for (const gateType of GATE_TYPES) {
      expect(GATE_DEFINITIONS[gateType]).toBeDefined();
    }
  });

  it("defines coding_question with answer/skip options", () => {
    expect(getGateDefinition("coding_question").allowedOptions).toEqual([
      "answer",
      "skip",
    ]);
  });

  it("does not include skip_risk_and_continue on forbidden gate types", () => {
    for (const gateType of [
      "deployment",
      "requirement_confirm",
      "tech_plan_confirm",
      "final_acceptance",
    ] as const) {
      expect(getGateDefinition(gateType).allowedOptions).not.toContain(
        "skip_risk_and_continue",
      );
      expect(gateTypeForbidsSkipRisk(gateType)).toBe(true);
    }
  });

  it("defines requirement_stuck scoped options", () => {
    expect(getGateDefinition("requirement_stuck").allowedOptions).toEqual([
      "keep_answering",
      "force_continue",
      "fail",
    ]);
  });
});
