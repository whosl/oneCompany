import { describe, expect, it } from "vitest";
import { parseBuildOutput } from "./build.js";

describe("parseBuildOutput", () => {
  it("passes on exit code 0", () => {
    expect(parseBuildOutput("built", "", 0).passed).toBe(true);
  });

  it("fails on non-zero exit", () => {
    expect(parseBuildOutput("", "build failed", 1).passed).toBe(false);
  });
});
