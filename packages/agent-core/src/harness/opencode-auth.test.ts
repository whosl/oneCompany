import { afterEach, describe, expect, it } from "vitest";
import { getDefaultOpencodeModelRef } from "./opencode-auth.js";

describe("opencode auth readiness", () => {
  const keys = [
    "OC_OPENCODE_MODEL_STRONG",
    "OC_OPENCODE_MODEL_STANDARD",
    "OC_OPENCODE_MODEL_CHEAP",
    "OC_OPENCODE_PROVIDER",
    "OC_LLM_API_KEY",
  ] as const;

  const saved: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("prefers OC_OPENCODE_MODEL_* env refs for readiness", () => {
    for (const key of keys) saved[key] = process.env[key];
    delete process.env.OC_OPENCODE_PROVIDER;
    delete process.env.OC_LLM_API_KEY;
    process.env.OC_OPENCODE_INTEGRATION = "1";
    process.env.OC_OPENCODE_MODEL_STRONG = "zhipuai-coding-plan/glm-5.1";

    expect(getDefaultOpencodeModelRef()).toBe("zhipuai-coding-plan/glm-5.1");

    delete process.env.OC_OPENCODE_INTEGRATION;
  });
});
