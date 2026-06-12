import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { artifacts, emit, redact, toolCalls, type Db, type EventEnvelope } from "@oc/shared";

export type ToolContext = {
  db: Db;
  projectId: string;
  logsPath?: string;
  onEvent?: (envelope: EventEnvelope) => void;
  /** Agent attribution for tool_call.* events (e.g. taizi vs coding). */
  agentId?: string;
};

export type CallToolInput = {
  toolName: string;
  args: unknown;
  impl: () => Promise<unknown>;
};

export type CallToolResult =
  | { ok: true; output: unknown; toolCallId: string }
  | { ok: false; error: string; toolCallId: string };

const INLINE_OUTPUT_MAX_BYTES = 8192;

function notify(ctx: ToolContext, envelope: EventEnvelope): void {
  ctx.onEvent?.(envelope);
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function formatToolText(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return redact(raw).text;
}

function persistToolOutput(
  ctx: ToolContext,
  toolCallId: string,
  raw: string,
): { summary: string; outputRef: string } {
  const { text } = redact(raw);
  const byteLength = Buffer.byteLength(text, "utf8");

  if (!ctx.logsPath || byteLength <= INLINE_OUTPUT_MAX_BYTES) {
    const summary = text.slice(0, 500);
    return {
      summary,
      outputRef: JSON.stringify({
        kind: "inline",
        text,
        byteLength,
        hash: hashText(text),
      }),
    };
  }

  fs.mkdirSync(ctx.logsPath, { recursive: true });
  const filePath = path.join(ctx.logsPath, `tool-${toolCallId}.log`);
  fs.writeFileSync(filePath, text, "utf8");
  const summary = `${text.slice(0, 240)}…`;
  const artifactId = randomUUID();
  const now = new Date().toISOString();

  ctx.db
    .insert(artifacts)
    .values({
      id: randomUUID(),
      project_id: ctx.projectId,
      artifact_id: artifactId,
      path: filePath,
      kind: "tool_output",
      created_at: now,
    })
    .run();

  const outputRef = JSON.stringify({
    kind: "chunk",
    path: filePath,
    byteLength,
    hash: hashText(text),
    summary,
  });

  return { summary, outputRef };
}

export async function callTool(ctx: ToolContext, input: CallToolInput): Promise<CallToolResult> {
  const toolCallId = randomUUID();
  const now = new Date().toISOString();
  const rowId = randomUUID();

  const started = emit(ctx.db, {
    projectId: ctx.projectId,
    agentId: ctx.agentId,
    payload: {
      type: "tool_call.started",
      projectId: ctx.projectId,
      toolCallId,
      toolName: input.toolName,
    },
  });
  notify(ctx, started);

  dbInsertToolCall(ctx.db, {
    id: rowId,
    projectId: ctx.projectId,
    toolCallId,
    toolName: input.toolName,
    status: "running",
    createdAt: now,
  });

  try {
    const output = await input.impl();
    const raw = typeof output === "string" ? output : JSON.stringify(output);
    const { summary, outputRef } = persistToolOutput(ctx, toolCallId, raw);

    const completed = emit(ctx.db, {
      projectId: ctx.projectId,
      agentId: ctx.agentId,
      payload: {
        type: "tool_call.output",
        projectId: ctx.projectId,
        toolCallId,
        output: summary,
      },
    });
    notify(ctx, completed);

    dbUpdateToolCallStatus(ctx.db, rowId, "completed", outputRef);

    return { ok: true, output, toolCallId };
  } catch (error) {
    const message = formatToolText(error instanceof Error ? error.message : String(error));

    const failed = emit(ctx.db, {
      projectId: ctx.projectId,
      agentId: ctx.agentId,
      payload: {
        type: "tool_call.failed",
        projectId: ctx.projectId,
        toolCallId,
        error: message,
      },
    });
    notify(ctx, failed);

    dbUpdateToolCallStatus(ctx.db, rowId, "failed", message);

    return { ok: false, error: message, toolCallId };
  }
}

function dbInsertToolCall(
  db: Db,
  input: {
    id: string;
    projectId: string;
    toolCallId: string;
    toolName: string;
    status: string;
    createdAt: string;
  },
): void {
  db.insert(toolCalls)
    .values({
      id: input.id,
      project_id: input.projectId,
      tool_call_id: input.toolCallId,
      tool_name: input.toolName,
      status: input.status,
      output_ref: null,
      created_at: input.createdAt,
    })
    .run();
}

function dbUpdateToolCallStatus(
  db: Db,
  id: string,
  status: string,
  outputRef: string,
): void {
  db.update(toolCalls)
    .set({
      status,
      output_ref: outputRef,
    })
    .where(eq(toolCalls.id, id))
    .run();
}
