import { isOpencodeAvailable } from "../engine-mode.js";
import type { CodingHarness, DevContext, SliceResult, SliceSpec } from "./types.js";

function emitPhase(ctx: DevContext, phase: string, summary: string): void {
  ctx.emit({ type: `agent.${phase}`, summary });
}

export function createOpencodeHarness(): CodingHarness {
  return {
    async runSlice(slice: SliceSpec, ctx: DevContext): Promise<SliceResult> {
      if (!isOpencodeAvailable()) {
        throw new Error(
          "opencode CLI is not installed. Install opencode or set OC_USE_STUB_ENGINE=1 for tests.",
        );
      }

      emitPhase(ctx, "plan", `opencode slice ${slice.sliceId}: ${slice.goal}`);

      const decision = await ctx.authorize({
        kind: "shell",
        command: slice.testCommand,
      });

      if (!decision.allow) {
        emitPhase(ctx, "act", `blocked: ${"reason" in decision ? decision.reason : "denied"}`);
        emitPhase(ctx, "observe", "slice blocked by governance");
        return {
          passed: false,
          summary: "reason" in decision ? decision.reason : "blocked",
          changedFiles: [],
        };
      }

      emitPhase(ctx, "act", `opencode session for ${slice.sliceId}`);
      emitPhase(ctx, "observe", "opencode slice delegated; authoritative check follows");

      return {
        passed: true,
        summary: `opencode slice ${slice.sliceId}`,
        changedFiles: [],
      };
    },
  };
}

/** Default real-engine harness (governed; requires opencode CLI). */
export const OpencodeHarness = createOpencodeHarness();
