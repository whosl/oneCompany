import { describe, expect, it } from "vitest";
import { assertOpenAiConfigured, EngineUnavailableError } from "./engine-mode.js";

describe("engine degradation — M9.5", () => {
  it("throws when OpenAI key is missing in real mode", () => {
    const previousStub = process.env.OC_USE_STUB_ENGINE;
    const previousKey = process.env.OPENAI_API_KEY;
    const previousLlm = process.env.OC_LLM_API_KEY;
    delete process.env.OC_USE_STUB_ENGINE;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OC_OPENAI_API_KEY;
    delete process.env.OC_LLM_API_KEY;

    try {
      expect(() => assertOpenAiConfigured()).toThrow(EngineUnavailableError);
    } finally {
      if (previousStub === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previousStub;
      }
      if (previousKey !== undefined) {
        process.env.OPENAI_API_KEY = previousKey;
      }
      if (previousLlm !== undefined) {
        process.env.OC_LLM_API_KEY = previousLlm;
      }
    }
  });
});
