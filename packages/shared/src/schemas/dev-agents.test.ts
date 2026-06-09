import { describe, expect, it } from "vitest";
import {
  ArchitectOutputSchema,
  CodingOutputSchema,
  DevopsDeliveryOutputSchema,
  PlannerOutputSchema,
  QaOutputSchema,
  ReviewOutputSchema,
  TestDesignerOutputSchema,
} from "./dev-agents.js";

describe("dev agent output schemas", () => {
  it("parses architect output", () => {
    const parsed = ArchitectOutputSchema.parse({
      techPlan: "# Stack\n- React",
      stack: ["react", "vitest"],
      architectureNotes: ["single repo"],
      risks: ["scope creep"],
    });
    expect(parsed.stack).toHaveLength(2);
  });

  it("coerces architect string fields to string arrays", () => {
    const parsed = ArchitectOutputSchema.parse({
      techPlan: "# Stack",
      stack: "typescript",
      architectureNotes: "monorepo layout",
      risks: "scope creep from optional features",
    });
    expect(parsed.stack).toEqual(["typescript"]);
    expect(parsed.architectureNotes).toEqual(["monorepo layout"]);
    expect(parsed.risks).toEqual(["scope creep from optional features"]);
  });

  it("parses test designer output", () => {
    const parsed = TestDesignerOutputSchema.parse({
      testSpecs: [
        {
          sliceId: "slice-1",
          testCommand: "pnpm vitest run src/a.test.ts --reporter=json",
          description: "scaffold test",
        },
      ],
    });
    expect(parsed.testSpecs[0]?.sliceId).toBe("slice-1");
  });

  it("parses planner output with required testCommand", () => {
    const parsed = PlannerOutputSchema.parse({
      slices: [
        {
          id: "slice-1",
          title: "Scaffold",
          testCommand: "pnpm vitest run src/scaffold.test.ts --reporter=json",
        },
      ],
    });
    expect(parsed.slices).toHaveLength(1);
  });

  it("rejects planner output without testCommand", () => {
    expect(() =>
      PlannerOutputSchema.parse({
        slices: [{ id: "slice-1", title: "Scaffold" }],
      }),
    ).toThrow();
  });

  it("parses coding, review, qa, and devops outputs", () => {
    expect(
      CodingOutputSchema.parse({ summary: "done", changedFiles: ["src/a.ts"] }).summary,
    ).toBe("done");
    expect(
      ReviewOutputSchema.parse({ approved: true, findings: [], summary: "ok" }).approved,
    ).toBe(true);
    expect(QaOutputSchema.parse({ passed: true, notes: [] }).passed).toBe(true);
    expect(
      DevopsDeliveryOutputSchema.parse({ artifacts: ["dist"], deploymentNotes: "n/a" })
        .artifacts,
    ).toHaveLength(1);
  });
});
