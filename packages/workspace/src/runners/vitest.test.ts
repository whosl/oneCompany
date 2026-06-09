import { describe, expect, it } from "vitest";
import { parseVitestJson } from "./vitest.js";

describe("parseVitestJson", () => {
  it("returns passed when numFailedTests is zero", () => {
    const result = parseVitestJson(
      JSON.stringify({ numFailedTests: 0, numPassedTests: 2, success: true }),
    );
    expect(result.passed).toBe(true);
    expect(result.passedCount).toBe(2);
  });

  it("returns failed when numFailedTests is positive", () => {
    const result = parseVitestJson(
      JSON.stringify({ numFailedTests: 1, numPassedTests: 1, success: false }),
    );
    expect(result.passed).toBe(false);
  });

  it("returns failed when no tests were executed", () => {
    const result = parseVitestJson(
      JSON.stringify({
        numTotalTests: 0,
        numFailedTests: 0,
        numPassedTests: 0,
        success: false,
        testResults: [],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.details).toContain("no tests executed");
  });
});
