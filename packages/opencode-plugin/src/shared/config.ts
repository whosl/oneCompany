export const DEFAULT_API_URL = "http://127.0.0.1:3001";
export const PLUGIN_ID = "onecompany";
export const OPENCODE_VERSION_RANGE = ">=1.16.2 <1.18";

export function resolveApiUrl(explicit?: string): string {
  const fromEnv =
    process.env.ONECOMPANY_API_URL?.trim() ||
    process.env.OC_API_URL?.trim() ||
    process.env.API_URL?.trim();
  const base = (explicit ?? fromEnv ?? DEFAULT_API_URL).replace(/\/$/, "");
  return base;
}
