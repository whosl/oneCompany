export type ConsoleUiMode = "legacy" | "v2" | "v3";

export function resolveConsoleUiMode(
  ui: string | undefined,
  environmentDefault: string | undefined,
): ConsoleUiMode {
  if (ui === "legacy") return "legacy";
  if (ui === "v3") return "v3";
  if (ui === "v2") return "v2";
  if (environmentDefault === "v3") return "v3";
  if (environmentDefault === "0") return "legacy";
  return "v2";
}

/** @deprecated Use resolveConsoleUiMode */
export function shouldUseUiV2(ui: string | undefined, environmentDefault: string | undefined) {
  return resolveConsoleUiMode(ui, environmentDefault) === "v2";
}
