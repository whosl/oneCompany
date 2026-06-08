import { describe, expect, it } from "vitest";
import { parseTypecheckOutput } from "./typecheck.js";

describe("parseTypecheckOutput", () => {
  it("passes clean output", () => {
    expect(parseTypecheckOutput("", "").passed).toBe(true);
  });

  it("fails on TS errors", () => {
    const result = parseTypecheckOutput("", "src/a.ts:1:1 - error TS2322: bad");
    expect(result.passed).toBe(false);
    expect(result.failedCount).toBe(1);
  });
});
