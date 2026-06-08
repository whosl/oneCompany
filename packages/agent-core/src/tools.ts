import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { emit, redact, toolCalls, type Db, type EventEnvelope } from "@oc/shared";

export type ToolContext = {
  db: Db;
  projectId: string;
  onEvent?: (envelope: EventEnvelope) => void;
};

export type CallToolInput = {
  toolName: string;
  args: unknown;
  impl: () => Promise<unknown>;
};

export type CallToolResult =
  | { ok: true; output: unknown; toolCallId: string }
  | { ok: false; error: string; toolCallId: string };

function notify(ctx: ToolContext, envelope: EventEnvelope): void {
  ctx.onEvent?.(envelope);
}

function formatToolText(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return redact(raw).text.slice(0, 500);
}

export async function callTool(ctx: ToolContext, input: CallToolInput): Promise<CallToolResult> {
  const toolCallId = randomUUID();
  const now = new Date().toISOString();
  const rowId = randomUUID();

  const started = emit(ctx.db, {
    projectId: ctx.projectId,
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
    const summary = formatToolText(output);

    const completed = emit(ctx.db, {
      projectId: ctx.projectId,
      payload: {
        type: "tool_call.output",
        projectId: ctx.projectId,
        toolCallId,
        output: summary,
      },
    });
    notify(ctx, completed);

    dbUpdateToolCallStatus(ctx.db, rowId, "completed", summary);

    return { ok: true, output, toolCallId };
  } catch (error) {
    const message = formatToolText(error instanceof Error ? error.message : String(error));

    const failed = emit(ctx.db, {
      projectId: ctx.projectId,
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
