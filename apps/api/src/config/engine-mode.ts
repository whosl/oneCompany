import {
  assertOpenAiConfigured,
  EngineUnavailableError,
  getOpenAiApiKey,
  isOpencodeAvailable,
  resolveEngineMode,
  type EngineMode,
} from "@oc/agent-core";

export {
  assertOpenAiConfigured,
  EngineUnavailableError,
  getOpenAiApiKey,
  isOpencodeAvailable,
  resolveEngineMode,
  type EngineMode,
};

export function isFixtureProfileAllowed(): boolean {
  return resolveEngineMode() === "stub";
}
