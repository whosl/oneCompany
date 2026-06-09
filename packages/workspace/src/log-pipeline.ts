import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  REDACTED,
  artifacts,
  redact,
  toolCalls,
  type Db,
  type RedactionIncident,
  type SecretRegistry,
} from "@oc/shared";

export { REDACTED, redact, type RedactionIncident, type SecretRegistry };

export const INLINE_OUTPUT_MAX_BYTES = 8192;

export type OutputRef =
  | { kind: "inline"; text: string; byteLength: number; hash: string }
  | { kind: "chunk"; path: string; byteLength: number; hash: string; summary: string };

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Return the full output text for a ref, reading the chunk file when output was
 * spilled to disk. Parsers must use this instead of only reading inline text,
 * otherwise large (chunked) outputs are seen as empty.
 */
export function readOutputText(ref: OutputRef): string {
  if (ref.kind === "inline") {
    return ref.text;
  }
  try {
    return fs.readFileSync(ref.path, "utf8");
  } catch {
    return "";
  }
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
