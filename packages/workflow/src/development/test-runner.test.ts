import { describe, expect, it } from "vitest";
import { parseVitestJson } from "./test-runner.js";

describe("parseVitestJson", () => {
  it("returns passed when numFailedTests is zero", () => {
    const result = parseVitestJson(
      JSON.stringify({ numFailedTests: 0, numPassedTests: 2, success: true }),
    );
    expect(result.passed).toBe(true);
  });

  it("returns failed when numFailedTests is positive", () => {
    const result = parseVitestJson(
      JSON.stringify({ numFailedTests: 1, numPassedTests: 1, success: false }),
    );
    expect(result.passed).toBe(false);
  });

  it("rejects invalid output", () => {
    const result = parseVitestJson("not-json");
    expect(result.passed).toBe(false);
  });
});
