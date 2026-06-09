const POLICY_OVERRIDE_PATTERNS = [
  /\bignore\s+(all\s+)?previous\s+instructions\b/i,
  /\bbypass\s+(risk|gate|policy)\b/i,
  /\boverride\s+system\b/i,
];

export type UntrustedPayload = {
  data: unknown;
  untrusted: true;
  source: string;
};

export function wrapUntrustedResource(source: string, data: unknown): UntrustedPayload {
  return { data, untrusted: true, source };
}

export function assertUntrustedResourceDoesNotOverridePolicy(payload: unknown): void {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
  for (const pattern of POLICY_OVERRIDE_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error("Untrusted integration resource attempted to override local policy");
    }
  }
}
