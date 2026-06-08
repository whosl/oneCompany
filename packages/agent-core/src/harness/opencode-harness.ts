import type { CodingHarness } from "./types.js";

/**
 * OpencodeHarness is opt-in via OC_OPENCODE_INTEGRATION=1 integration tests.
 * CI uses StubHarness by default.
 */
export const OpencodeHarness: CodingHarness = {
  async runSlice(slice, ctx) {
    throw new Error(
      `OpencodeHarness is not configured in CI. Slice ${slice.sliceId} requires OC_OPENCODE_INTEGRATION=1`,
    );
  },
};
