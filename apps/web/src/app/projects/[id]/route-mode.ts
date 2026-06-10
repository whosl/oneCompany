export function shouldUseUiV2(ui: string | undefined, environmentDefault: string | undefined) {
  if (ui === "legacy") return false;
  if (ui === "v2") return true;
  if (environmentDefault === "0") return false;
  return true;
}
