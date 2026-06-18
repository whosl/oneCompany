import { describe, expect, it } from "vitest";
import {
  FINAL_SUITE_IDS,
  isFinalSuite,
  isSliceSuite,
  NormalizedRunnerResultSchema,
} from "./testing.js";

describe("testing schemas", () => {
  it("parses normalized runner result", () => {
    const parsed = NormalizedRunnerResultSchema.parse({
      suite: "final:vitest",
      status: "passed",
      passedCount: 3,
      failedCount: 0,
    });
    expect(parsed.suite).toBe("final:vitest");
  });

  it("distinguishes final vs slice suite prefixes", () => {
    expect(isFinalSuite("final:vitest")).toBe(true);
    expect(isSliceSuite("slice:slice-1")).toBe(true);
    expect(isFinalSuite("slice:slice-1")).toBe(false);
    expect(FINAL_SUITE_IDS[0]).toBe("final:deps");
    expect(FINAL_SUITE_IDS).toContain("final:deps");
    expect(FINAL_SUITE_IDS).toContain("final:playwright");
  });
});
