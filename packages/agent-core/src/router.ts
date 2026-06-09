import { getDefaultOpencodeModelRef } from "./harness/opencode-auth.js";

export type ModelTier = "cheap" | "standard" | "strong";

// For opencode, set OC_MODEL_* as `provider/model`, e.g. `zhipuai-coding-plan/glm-5.1`.
// When unset, picks up ~/.local/share/opencode/auth.json (zhipuai-coding-plan preferred).
const LOCAL_DEFAULT = getDefaultOpencodeModelRef();

const DEFAULT_MODELS: Record<ModelTier, string> = {
  cheap: process.env.OC_MODEL_CHEAP ?? LOCAL_DEFAULT ?? "gpt-4.1-mini",
  standard: process.env.OC_MODEL_STANDARD ?? LOCAL_DEFAULT ?? "gpt-4.1",
  strong: process.env.OC_MODEL_STRONG ?? LOCAL_DEFAULT ?? "o4-mini",
};

export function pickModel(tier: ModelTier): string {
  const model = DEFAULT_MODELS[tier];
  if (!model) {
    throw new Error(`Unknown model tier: ${tier}`);
  }
  return model;
}
