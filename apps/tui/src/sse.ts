import type { EventEnvelope } from "./types.js";

export type SseHandle = {
  stop: () => void;
  isConnected: () => boolean;
};

/** SSE consumer with automatic reconnect; resumes from the last seen seq. */
export function startEventStream(
  apiBase: string,
  projectId: string,
  afterSeq: number,
  onEvent: (envelope: EventEnvelope) => void,
  onStateChange?: (connected: boolean) => void,
): SseHandle {
  const controller = new AbortController();
  let cursor = afterSeq;
  let connected = false;
  let stopped = false;

  const setConnected = (value: boolean): void => {
    if (connected !== value) {
      connected = value;
      onStateChange?.(value);
    }
  };

  const consume = async (): Promise<void> => {
    while (!stopped) {
      try {
        const res = await fetch(
          `${apiBase}/projects/${projectId}/events/stream?afterSeq=${cursor}`,
          { signal: controller.signal },
        );
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        setConnected(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
            if (dataLine) {
              try {
                const envelope = JSON.parse(dataLine.slice(5).trim()) as EventEnvelope;
                if (envelope.seq === 0) {
                  // Ephemeral (broadcast-only) envelope — deliver without
                  // advancing the replay cursor.
                  onEvent(envelope);
                } else if (envelope.seq > cursor) {
                  cursor = envelope.seq;
                  onEvent(envelope);
                }
              } catch {
                /* malformed frame */
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        /* fall through to reconnect */
      }
      setConnected(false);
      if (stopped) return;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  };

  void consume();

  return {
    stop: () => {
      stopped = true;
      controller.abort();
      setConnected(false);
    },
    isConnected: () => connected,
  };
}
