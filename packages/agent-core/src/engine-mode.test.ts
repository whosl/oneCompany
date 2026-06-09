import { describe, expect, it } from "vitest";
import { getManagedApiKeys, resolveEngineMode } from "./engine-mode.js";

describe("engine mode — M9.5", () => {
  it("defaults to real when OC_USE_STUB_ENGINE is unset", () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    delete process.env.OC_USE_STUB_ENGINE;
    try {
      expect(resolveEngineMode()).toBe("real");
    } finally {
      if (previous === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previous;
      }
    }
  });

  it("uses stub when OC_USE_STUB_ENGINE=1", () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    process.env.OC_USE_STUB_ENGINE = "1";
    try {
      expect(resolveEngineMode()).toBe("stub");
    } finally {
      if (previous === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previous;
      }
    }
  });

  it("prefers OC_LLM_API_KEY for OpenAI-compatible clients", () => {
    const prevLlm = process.env.OC_LLM_API_KEY;
    const prevOpenAi = process.env.OPENAI_API_KEY;
    const prevLegacy = process.env.OC_OPENAI_API_KEY;
    process.env.OC_LLM_API_KEY = "llm-key";
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OC_OPENAI_API_KEY = "legacy-key";
    try {
      expect(getManagedApiKeys().openai).toBe("llm-key");
    } finally {
      if (prevLlm === undefined) delete process.env.OC_LLM_API_KEY;
      else process.env.OC_LLM_API_KEY = prevLlm;
      if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAi;
      if (prevLegacy === undefined) delete process.env.OC_OPENAI_API_KEY;
      else process.env.OC_OPENAI_API_KEY = prevLegacy;
    }
  });
});
