import { MemorySaver } from "@langchain/langgraph";

let sharedCheckpointer: MemorySaver | null = null;

/** Process-wide graph checkpoint store (LangGraph interrupt/resume pointer). */
export function resolveGraphCheckpointer(): MemorySaver {
  if (!sharedCheckpointer) {
    sharedCheckpointer = new MemorySaver();
  }
  return sharedCheckpointer;
}

export function resetGraphCheckpointerForTests(): void {
  sharedCheckpointer = null;
}
