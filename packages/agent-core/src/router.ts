export type ModelTier = "cheap" | "standard" | "strong";

const DEFAULT_MODELS: Record<ModelTier, string> = {
  cheap: process.env.OC_MODEL_CHEAP ?? "gpt-4.1-mini",
  standard: process.env.OC_MODEL_STANDARD ?? "gpt-4.1",
  strong: process.env.OC_MODEL_STRONG ?? "o4-mini",
};

export function pickModel(tier: ModelTier): string {
  const model = DEFAULT_MODELS[tier];
  if (!model) {
    throw new Error(`Unknown model tier: ${tier}`);
  }
  return model;
}
