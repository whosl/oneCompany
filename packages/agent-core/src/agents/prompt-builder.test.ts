import { describe, expect, it } from "vitest";
import { buildTddPrompt } from "./prompt-builder.js";

describe("buildTddPrompt", () => {
  it("includes retry repair context before test instructions", () => {
    const prompt = buildTddPrompt({
      projectId: "project-1",
      sliceId: "slice-2",
      goal: "牌桌游戏核心",
      acceptanceChecks: ["typecheck passes"],
      testCommand: "pnpm vitest run tests/slice2.test.ts --reporter=json",
      retryContext: [
        "Previous typecheck failure repeated 2 time(s) for this slice.",
        "Latest failure evidence: tests passed but typecheck failed: src/table.ts(12,4): error TS2322",
      ],
      modelTier: "strong",
    });

    expect(prompt).toContain("Retry repair context from previous attempt(s):");
    expect(prompt).toContain("Previous typecheck failure repeated 2 time(s)");
    expect(prompt).toContain("Start from this evidence first");
    expect(prompt.indexOf("Retry repair context")).toBeLessThan(
      prompt.indexOf("Scoped test command"),
    );
  });
});
