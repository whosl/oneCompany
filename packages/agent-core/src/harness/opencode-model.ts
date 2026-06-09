import type { ModelTier } from "../router.js";
import { getDefaultOpencodeModelRef } from "./opencode-auth.js";

const OPENCODE_TIER_ENV: Record<ModelTier, string> = {
  cheap: "OC_OPENCODE_MODEL_CHEAP",
  standard: "OC_OPENCODE_MODEL_STANDARD",
  strong: "OC_OPENCODE_MODEL_STRONG",
};

const LEGACY_TIER_ENV: Record<ModelTier, string> = {
  cheap: "OC_MODEL_CHEAP",
  standard: "OC_MODEL_STANDARD",
  strong: "OC_MODEL_STRONG",
};

function isProviderModelRef(model: string): boolean {
  return model.includes("/");
}

/** Model ref for opencode serve (`provider/model`). Never use workflow plain model ids here. */
export function pickOpencodeModel(tier: ModelTier): string {
  for (const key of [OPENCODE_TIER_ENV[tier], LEGACY_TIER_ENV[tier]]) {
    const value = process.env[key];
    if (value && isProviderModelRef(value)) {
      return value;
    }
  }

  const fallback = getDefaultOpencodeModelRef();
  if (fallback) {
    return fallback;
  }

  return tier === "strong" ? "openai/o4-mini" : "openai/gpt-4.1-mini";
}
