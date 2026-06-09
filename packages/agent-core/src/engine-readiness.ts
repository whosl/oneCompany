import { getOpenAiApiKey, isOpencodeAvailable } from "./engine-mode.js";
import { getDefaultOpencodeModelRef } from "./harness/opencode-auth.js";

export type EngineReadinessSnapshot = {
  workflowLlmReady: boolean;
  opencodeCliReady: boolean;
  opencodeModelReady: boolean;
};

export function getEngineReadiness(): EngineReadinessSnapshot {
  return {
    workflowLlmReady: Boolean(getOpenAiApiKey()),
    opencodeCliReady: isOpencodeAvailable(),
    opencodeModelReady: Boolean(getDefaultOpencodeModelRef()),
  };
}
