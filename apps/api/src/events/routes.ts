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

      const writeEnvelope = async (envelope: EventEnvelope): Promise<void> => {
        if (envelope.seq <= afterSeq || seenSeqs.has(envelope.seq)) {
          return;
        }
        seenSeqs.add(envelope.seq);
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
