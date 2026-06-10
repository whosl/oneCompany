import { ChatOpenAI } from "@langchain/openai";
import { assertOpenAiConfigured, getOpenAiApiKey } from "../engine-mode.js";
import { pickModel, type ModelTier } from "../router.js";

function resolveBaseUrl(): string {
  return process.env.OC_LLM_BASE_URL?.trim() || "https://api.openai.com/v1";
}

/** Multi-provider ChatOpenAI instance (OpenAI, DeepSeek, GLM via compatible base URL). */
export function createChatModel(tier: ModelTier): ChatOpenAI {
  assertOpenAiConfigured();
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OpenAI-compatible API key is not configured");
  }

  return new ChatOpenAI({
    model: pickModel(tier),
    apiKey,
    configuration: {
      baseURL: resolveBaseUrl(),
    },
    temperature: 0.2,
    // Stream tokens so long generations can surface live progress
    // (handleLLMNewToken callbacks); invoke() still resolves with the
    // aggregated final message.
    streaming: true,
  });
}
