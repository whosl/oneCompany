import type { CodingHarness } from "./types.js";

export const StubHarness: CodingHarness = {
  async runSlice(slice, ctx) {
    ctx.emit({ type: "agent.plan", summary: `plan ${slice.sliceId}` });

    const decision = await ctx.authorize({
      kind: "shell",
      command: slice.testCommand,
    });

    ctx.emit({
      type: "agent.act",
      summary: decision.allow ? "ran tests" : "blocked",
    });
    ctx.emit({ type: "agent.observe", summary: "stub result" });

    return {
      passed: decision.allow,
      summary: "stub",
      changedFiles: [],
    };
  },
};
