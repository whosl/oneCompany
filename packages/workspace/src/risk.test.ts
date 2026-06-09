import { describe, expect, it } from "vitest";
import { classifyCommand, classifyToolOp } from "./risk.js";

describe("risk classifier — M5", () => {
  it("classifies read-only commands as low", () => {
    expect(classifyCommand("git status")).toBe("low");
    expect(classifyCommand("npm test")).toBe("low");
    expect(classifyCommand("pnpm vitest run src/slice.test.ts --reporter=json")).toBe("medium");
  });

  it("classifies the resolved node vitest.mjs binary as a test command (medium)", () => {
    expect(
      classifyCommand(
        'node "/repo/node_modules/vitest/vitest.mjs" run src/slice.test.ts --reporter=json',
      ),
    ).toBe("medium");
  });

  it("classifies file generation as medium", () => {
    expect(classifyCommand("echo hello > foo.ts")).toBe("medium");
  });

  it("classifies constrained npm ci with lockfile and registry pin", () => {
    expect(
      classifyCommand("npm ci --ignore-scripts", {
        lockfilePresent: true,
        registryPinned: true,
      }),
    ).toBe("medium_constrained");
  });

  it("treats npm install and unknown commands as high", () => {
    expect(classifyCommand("npm install lodash")).toBe("high");
    expect(classifyCommand("totally-unknown-cmd")).toBe("high");
  });

  it("classifies deploy and tunnel commands as high_deploy", () => {
    expect(classifyCommand("vercel deploy")).toBe("high_deploy");
    expect(classifyCommand("cloudflared tunnel run")).toBe("high_deploy");
  });

  it("maps tool ops to risk levels", () => {
    expect(classifyToolOp({ kind: "read", path: "src/a.ts" })).toBe("low");
    expect(classifyToolOp({ kind: "edit", path: "src/a.ts" })).toBe("medium");
    expect(classifyToolOp({ kind: "shell", command: "npm install" })).toBe("high");
    expect(classifyToolOp({ kind: "edit", path: "../outside.ts" })).toBe("high");
  });
});
