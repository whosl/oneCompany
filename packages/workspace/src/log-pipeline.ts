import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { artifacts, toolCalls, type Db } from "@oc/shared";

export const REDACTED = "***REDACTED***";
export const INLINE_OUTPUT_MAX_BYTES = 8192;

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

export type OutputRef =
  | { kind: "inline"; text: string; byteLength: number; hash: string }
  | { kind: "chunk"; path: string; byteLength: number; hash: string; summary: string };

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

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function persistOutput(
  deps: {
    db: Db;
    projectId: string;
    logsPath: string;
    toolCallId: string;
  },
  raw: string,
): OutputRef {
  const { text } = redact(raw);
  const byteLength = Buffer.byteLength(text, "utf8");
  const hash = hashText(text);

  if (byteLength <= INLINE_OUTPUT_MAX_BYTES) {
    return { kind: "inline", text, byteLength, hash };
  }

  const fileName = `cmd-${deps.toolCallId}.log`;
  const filePath = path.join(deps.logsPath, fileName);
  fs.mkdirSync(deps.logsPath, { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");

  const summary = `${text.slice(0, 240)}…`;
  const artifactId = randomUUID();
  const now = new Date().toISOString();

  deps.db
    .insert(artifacts)
    .values({
      id: artifactId,
      project_id: deps.projectId,
      artifact_id: deps.toolCallId,
      path: filePath,
      kind: "command_output",
      created_at: now,
    })
    .run();

  deps.db
    .update(toolCalls)
    .set({ output_ref: JSON.stringify({ kind: "chunk", path: filePath, byteLength, hash, summary }) })
    .where(eq(toolCalls.tool_call_id, deps.toolCallId))
    .run();

  return { kind: "chunk", path: filePath, byteLength, hash, summary };
}
