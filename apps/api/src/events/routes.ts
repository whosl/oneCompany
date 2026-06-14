import { listEvents, type EventEnvelope } from "@oc/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Db } from "@oc/shared";
import { subscribeProject } from "./broadcast.js";

export function createEventRoutes(db: Db) {
  const router = new Hono();

  router.get("/:id/events/stream", (c) => {
    const projectId = c.req.param("id");
    const afterSeq = Number(c.req.query("afterSeq") ?? "0");

    return streamSSE(c, async (stream) => {
      const seenSeqs = new Set<number>();

      // Flush the response headers immediately. Without an opening frame,
      // development proxies may keep an idle SSE response buffered until the
      // first business event and clients incorrectly report the stream offline.
      await stream.write(": connected\n\n");

      const writeEnvelope = async (envelope: EventEnvelope): Promise<void> => {
        // seq=0 marks ephemeral (broadcast-only) envelopes: always pass them
        // through, never dedupe by seq — they are not part of the event log.
        if (envelope.seq > 0 && (envelope.seq <= afterSeq || seenSeqs.has(envelope.seq))) {
          return;
        }
        if (envelope.seq > 0) seenSeqs.add(envelope.seq);
        await stream.writeSSE({ data: JSON.stringify(envelope) });
      };

      await new Promise<void>((resolve) => {
        const unsubscribe = subscribeProject(projectId, (envelope) => {
          void writeEnvelope(envelope);
        });

        void (async () => {
          const replay = listEvents(db, projectId, { afterSeq });
          for (const envelope of replay) {
            await writeEnvelope(envelope);
          }
        })();

        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          unsubscribe();
          resolve();
        };

        stream.onAbort(finish);
      });
    });
  });

  return router;
}
