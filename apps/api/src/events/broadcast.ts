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
    listener(envelope);
  }
}

export function resetBroadcasts(): void {
  listenersByProject.clear();
}
