import type { EventEnvelope } from "./types.js";

export type SseHandle = {
  stop: () => void;
};

export function startEventStream(
  apiBase: string,
  projectId: string,
  afterSeq: number,
  onEvent: (envelope: EventEnvelope) => void,
): SseHandle {
  const controller = new AbortController();
  let cursor = afterSeq;

  void (async () => {
    const url = `${apiBase}/projects/${projectId}/events/stream?afterSeq=${cursor}`;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (dataLine) {
            const json = dataLine.slice(5).trim();
            try {
              const envelope = JSON.parse(json) as EventEnvelope;
              if (envelope.seq > cursor) {
                cursor = envelope.seq;
                onEvent(envelope);
              }
            } catch {
              // ignore malformed frames
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch {
      // stream closed or aborted
    }
  })();

  return {
    stop: () => controller.abort(),
  };
}
