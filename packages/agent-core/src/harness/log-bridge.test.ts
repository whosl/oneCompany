import { describe, expect, it } from "vitest";
import { formatCommandOutput } from "./log-bridge.js";

describe("log-bridge", () => {
  it("redacts secret-like output", () => {
    const output = formatCommandOutput("tool-1", "token=sk-abcdefghijklmnopqrst");
    expect(output).not.toContain("sk-abcdefghijklmnopqrst");
    expect(output).toContain("***REDACTED***");
  });

  it("uses custom formatter when provided", () => {
    const output = formatCommandOutput("tool-2", "hello", {
      formatOutput: () => "stored-summary",
    });
    expect(output).toBe("stored-summary");
  });
});
