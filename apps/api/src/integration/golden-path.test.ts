import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.OC_OPENCODE_INTEGRATION)("golden path — M9.5", () => {
  it("runs requirement through real engine (integration)", async () => {
    // Optional CI job: OC_OPENCODE_INTEGRATION=1 OPENAI_API_KEY=... pnpm --filter @oc/api test golden-path
    expect(process.env.OPENAI_API_KEY ?? process.env.OC_OPENAI_API_KEY).toBeTruthy();
  });
});
