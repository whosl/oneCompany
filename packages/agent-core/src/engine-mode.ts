export type EngineMode = "real" | "stub";

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

export function resolveEngineMode(): EngineMode {
  if (process.env.OC_USE_STUB_ENGINE === "1") {
    return "stub";
  }
  return "real";
}

export type ManagedApiKeys = {
  openai?: string;
};

export function getManagedApiKeys(): ManagedApiKeys {
  return {
    openai: process.env.OC_LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OC_OPENAI_API_KEY,
  };
}

export function getOpenAiApiKey(): string | undefined {
  return getManagedApiKeys().openai;
}

export function assertOpenAiConfigured(): void {
  if (!getOpenAiApiKey()) {
    throw new EngineUnavailableError(
      "OpenAI-compatible API key is not configured. Set OC_LLM_API_KEY or OPENAI_API_KEY (or use OC_USE_STUB_ENGINE=1 for tests).",
    );
  }
}

import { commandExists } from "./util/command.js";

export function isOpencodeAvailable(): boolean {
  return commandExists("opencode");
}
