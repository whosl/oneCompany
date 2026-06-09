export type ModelTier = "cheap" | "standard" | "strong";

const WORKFLOW_TIER_ENV: Record<ModelTier, string> = {
  cheap: "OC_WORKFLOW_MODEL_CHEAP",
  standard: "OC_WORKFLOW_MODEL_STANDARD",
  strong: "OC_WORKFLOW_MODEL_STRONG",
};

const LEGACY_TIER_ENV: Record<ModelTier, string> = {
  cheap: "OC_MODEL_CHEAP",
  standard: "OC_MODEL_STANDARD",
  strong: "OC_MODEL_STRONG",
};

function resolveWorkflowDefaults(): Record<ModelTier, string> {
  const base = process.env.OC_LLM_BASE_URL ?? "";
  if (base.includes("deepseek")) {
    return {
      cheap: "deepseek-v4-flash",
      standard: "deepseek-v4-flash",
      strong: "deepseek-v4-pro",
    };
  }
  return {
    cheap: "gpt-4.1-mini",
    standard: "gpt-4.1",
    strong: "o4-mini",
  };
}

function legacyWorkflowModel(tier: ModelTier): string | undefined {
  const value = process.env[LEGACY_TIER_ENV[tier]];
  if (value && !value.includes("/")) {
    return value;
  }
  return undefined;
}

/** Plain model id for workflow agents (`callOpenAiChatJson`). Opencode uses `pickOpencodeModel`. */
export function pickModel(tier: ModelTier): string {
  const defaults = resolveWorkflowDefaults();
  const model =
    process.env[WORKFLOW_TIER_ENV[tier]] ?? legacyWorkflowModel(tier) ?? defaults[tier];
  if (!model) {
    throw new Error(`Unknown model tier: ${tier}`);
  }
  return model;
}
