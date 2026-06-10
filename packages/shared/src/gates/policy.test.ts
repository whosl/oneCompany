import { describe, expect, it } from "vitest";
import {
  assertAllowedDecision,
  getAllowedOptions,
  isAllowedDecision,
  isApprovalDecision,
  normalizeDecision,
  parseDecision,
  resolveGateDecision,
} from "./policy.js";

describe("gate policy — M4", () => {
  it("allows requirement_stuck decisions", () => {
    expect(isAllowedDecision("requirement_stuck", "force_continue")).toBe(true);
    expect(() => assertAllowedDecision("requirement_stuck", "force_continue")).not.toThrow();
  });

  it("rejects skip_risk_and_continue on deployment", () => {
    expect(isAllowedDecision("deployment", "skip_risk_and_continue")).toBe(false);
    expect(() => assertAllowedDecision("deployment", "skip_risk_and_continue")).toThrow(
      /not allowed/,
    );
  });

  it("removes skip_risk_and_continue for high-risk dangerous_operation", () => {
    expect(getAllowedOptions("dangerous_operation", { riskLevel: "high" })).not.toContain(
      "skip_risk_and_continue",
    );
    expect(isAllowedDecision("dangerous_operation", "skip_risk_and_continue", { riskLevel: "high" })).toBe(
      false,
    );
  });

  it("keeps skip_risk_and_continue for medium-risk dangerous_operation", () => {
    expect(getAllowedOptions("dangerous_operation", { riskLevel: "medium" })).toContain(
      "skip_risk_and_continue",
    );
  });

  it("normalizes custom decisions", () => {
    expect(
      normalizeDecision({ decision: "custom", customText: "ship with known gaps" }),
    ).toBe("custom:ship with known gaps");
  });

  it("parses custom decisions", () => {
    expect(parseDecision("custom:note")).toEqual({
      raw: "custom:note",
      kind: "custom",
      customText: "note",
      isCustom: true,
    });
  });

  it("maps custom to approve for requirement_confirm", () => {
    expect(resolveGateDecision("requirement_confirm", "custom:note")).toEqual({
      effective: "approve",
      customText: "note",
    });
  });

  it("maps custom to accept for final_acceptance", () => {
    expect(resolveGateDecision("final_acceptance", "custom:note")).toEqual({
      effective: "accept",
      customText: "note",
    });
  });

  it("rejects skip_risk_and_continue on high-risk dangerous_operation at execution layer", () => {
    expect(
      isApprovalDecision("dangerous_operation", { riskLevel: "high" }, "skip_risk_and_continue"),
    ).toBe(false);
  });

  it("rejects skip_risk_and_continue on deployment at execution layer", () => {
    expect(isApprovalDecision("deployment", {}, "skip_risk_and_continue")).toBe(false);
  });

  it("treats custom as approval for dangerous_operation execution", () => {
    expect(isApprovalDecision("dangerous_operation", { riskLevel: "high" }, "custom:ok")).toBe(
      true,
    );
  });
});
