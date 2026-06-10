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

  async runReview(review, ctx) {
    ctx.emit({ type: "agent.plan", summary: `审查切片 ${review.sliceId}` });
    ctx.emit({ type: "agent.reflect", summary: "审查结论：✓ 通过 — stub" });
    return { approved: true, findings: [], summary: "stub review" };
  },
};
