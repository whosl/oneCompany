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

export function getOpenAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY ?? process.env.OC_OPENAI_API_KEY;
}

export function assertOpenAiConfigured(): void {
  if (!getOpenAiApiKey()) {
    throw new EngineUnavailableError(
      "OPENAI_API_KEY is not configured. Set OPENAI_API_KEY or use OC_USE_STUB_ENGINE=1 for tests.",
    );
  }
}

import { commandExists } from "./util/command.js";

export function isOpencodeAvailable(): boolean {
  return commandExists("opencode");
}
