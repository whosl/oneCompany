import { afterEach, describe, expect, it } from "vitest";
import { pickModel } from "./router.js";

const ENV_KEYS = [
  "OC_LLM_BASE_URL",
  "OC_WORKFLOW_MODEL_CHEAP",
  "OC_WORKFLOW_MODEL_STANDARD",
  "OC_WORKFLOW_MODEL_STRONG",
  "OC_MODEL_CHEAP",
  "OC_MODEL_STANDARD",
  "OC_MODEL_STRONG",
] as const;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("model router — M2", () => {
  afterEach(() => {
    clearEnv();
  });

  it("maps cheap tier to gpt-4.1-mini by default", () => {
    expect(pickModel("cheap")).toBe("gpt-4.1-mini");
  });

  it("maps standard tier to gpt-4.1 by default", () => {
    expect(pickModel("standard")).toBe("gpt-4.1");
  });

  it("maps strong tier to o4-mini by default", () => {
    expect(pickModel("strong")).toBe("o4-mini");
  });

  it("defaults to DeepSeek models when OC_LLM_BASE_URL points at DeepSeek", () => {
    process.env.OC_LLM_BASE_URL = "https://api.deepseek.com/v1";
    expect(pickModel("cheap")).toBe("deepseek-v4-flash");
    expect(pickModel("standard")).toBe("deepseek-v4-flash");
    expect(pickModel("strong")).toBe("deepseek-v4-pro");
  });

  it("ignores provider/model OC_MODEL_* refs for workflow agents", () => {
    process.env.OC_MODEL_STRONG = "zhipuai-coding-plan/glm-5.1";
    expect(pickModel("strong")).toBe("o4-mini");
  });
});
