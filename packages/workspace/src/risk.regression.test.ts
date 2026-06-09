import { describe, expect, it } from "vitest";
import { classifyCommand } from "./risk.js";

const CASES: Array<{ cmd: string; level: ReturnType<typeof classifyCommand> }> = [
  { cmd: "echo hello", level: "low" },
  { cmd: "pnpm vitest run", level: "medium" },
  { cmd: "rm -rf node_modules", level: "high" },
  { cmd: "cloudflared tunnel run", level: "high_deploy" },
  { cmd: "npm install lodash", level: "high" },
  { cmd: "totally-unknown-cmd", level: "high" },
];

describe("risk regression — M11 §12", () => {
  it.each(CASES)("classifies $cmd as $level", ({ cmd, level }) => {
    expect(classifyCommand(cmd)).toBe(level);
  });
});
