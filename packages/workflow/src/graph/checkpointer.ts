import path from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

let sharedCheckpointer: BaseCheckpointSaver | null = null;

/**
 * In-memory savers keep tests isolated and avoid better-sqlite3 file/connection
 * lifecycle churn. Production uses a durable SqliteSaver so interrupt/resume
 * survives process restarts.
 */
function useMemorySaver(): boolean {
  return (
    process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.OC_GRAPH_CHECKPOINTER === "memory"
  );
}

function resolveCheckpointDbPath(): string {
  if (process.env.OC_TEST_DB_PATH) {
    return process.env.OC_TEST_DB_PATH;
  }
  return path.resolve(process.cwd(), "../../data/app.sqlite");
}

/** Process-wide durable graph checkpoint store (LangGraph interrupt/resume pointer). */
export function resolveGraphCheckpointer(): BaseCheckpointSaver {
  if (!sharedCheckpointer) {
    sharedCheckpointer = useMemorySaver()
      ? new MemorySaver()
      : SqliteSaver.fromConnString(resolveCheckpointDbPath());
  }
  return sharedCheckpointer;
}

/** True when this thread has a LangGraph checkpoint (e.g. after interrupt). */
export async function hasGraphCheckpoint(threadId: string): Promise<boolean> {
  const tuple = await resolveGraphCheckpointer().getTuple({
    configurable: { thread_id: threadId },
  });
  return tuple !== undefined;
}

export function resetGraphCheckpointerForTests(): void {
  sharedCheckpointer = null;
}
