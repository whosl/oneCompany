export const REDACTED = "***REDACTED***";

const SECRET_ENV_NAMES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLOUDFLARE_TUNNEL_TOKEN",
  "VERCEL_TOKEN",
  "GITHUB_TOKEN",
];

const TOKEN_PATTERNS = [
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
];

export type RedactionIncident = {
  kind: "env" | "pattern";
  label: string;
};

export type SecretRegistry = Record<string, string>;

export function redact(
  text: string,
  secrets: SecretRegistry = {},
): { text: string; incidents: RedactionIncident[] } {
  let output = text;
  const incidents: RedactionIncident[] = [];

  for (const [name, value] of Object.entries(secrets)) {
    if (value && output.includes(value)) {
      output = output.split(value).join(REDACTED);
      incidents.push({ kind: "env", label: name });
    }
  }

  for (const envName of SECRET_ENV_NAMES) {
    const value = secrets[envName] ?? process.env[envName];
    if (value && output.includes(value)) {
      output = output.split(value).join(REDACTED);
      incidents.push({ kind: "env", label: envName });
    }
  }

  for (const pattern of TOKEN_PATTERNS) {
    if (pattern.test(output)) {
      output = output.replace(pattern, REDACTED);
      incidents.push({ kind: "pattern", label: pattern.source });
      pattern.lastIndex = 0;
    }
  }

  return { text: output, incidents };
}
