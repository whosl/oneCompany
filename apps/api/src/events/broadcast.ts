import type { EventEnvelope } from "@oc/shared";

type ProjectListener = (envelope: EventEnvelope) => void;

const listenersByProject = new Map<string, Set<ProjectListener>>();

export function subscribeProject(projectId: string, listener: ProjectListener): () => void {
  const listeners = listenersByProject.get(projectId) ?? new Set<ProjectListener>();
  listeners.add(listener);
  listenersByProject.set(projectId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByProject.delete(projectId);
    }
  };
}

export function broadcastEvent(envelope: EventEnvelope): void {
  const listeners = listenersByProject.get(envelope.projectId);
  if (!listeners) {
    return;
  }
  for (const listener of listeners) {
    // Isolate per-listener failures: one slow/broken subscriber must never
    // propagate an exception back into the producer (e.g. createGate/setStatus
    // would otherwise fail AFTER the business mutation was already committed).
    try {
      listener(envelope);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(
        `[onecompany] SSE listener threw for project ${envelope.projectId}: ${detail}`,
      );
    }
  }
}

export function resetBroadcasts(): void {
  listenersByProject.clear();
}
