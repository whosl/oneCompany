import { listEvents, type EventEnvelope } from "@oc/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Db } from "@oc/shared";
import { subscribeProject } from "./broadcast.js";

/** Heartbeat interval: proxies (nginx/cloudflare) typically drop idle
 * connections at 60s, so keep well under that. */
const SSE_HEARTBEAT_INTERVAL_MS = 25_000;
/** Cap replay rows so a long-lived project's catch-up cannot stall the first
 * live frame indefinitely. */
const REPLAY_ROW_LIMIT = 2000;

export function createEventRoutes(db: Db) {
  const router = new Hono();

  router.get("/:id/events/stream", (c) => {
    const projectId = c.req.param("id");
    const parsedSeq = Number(c.req.query("afterSeq") ?? "0");
    if (!Number.isFinite(parsedSeq) || parsedSeq < 0) {
      return c.json({ error: "afterSeq must be a non-negative number" }, 400);
    }
    const afterSeq = parsedSeq;

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

      // Resolve the gate once replay completes, the stream aborts, the replay
      // errors, or the heartbeat fails — so the promise can never hang forever.
      await new Promise<void>((resolve) => {
        let replayDone = false;
        let settled = false;

        const unsubscribe = subscribeProject(projectId, (envelope) => {
          // Replay must finish before live events are written, otherwise an
          // interleaving could drop or duplicate frames. Replay is fast and
          // bounded by REPLAY_ROW_LIMIT, so live writes simply enqueue behind
          // the already-draining microtask queue in practice.
          writeEnvelope(envelope).catch(() => finish("write_failed"));
        });

        const finish = (reason: string): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearInterval(heartbeat);
          stream.onAbort(() => {});
          unsubscribe();
          if (reason === "replay_error" && !replayDone) {
            // Replay threw before completing — attempt to surface an error
            // frame so the client knows events may be missing, then close.
            void stream
              .writeSSE({
                event: "error",
                data: JSON.stringify({ type: "replay_failed" }),
              })
              .catch(() => {})
              .finally(resolve);
            return;
          }
          resolve();
        };

        // Periodic heartbeat keeps intermediate proxies from declaring the
        // connection dead during quiet periods and lets the client measure
        // true liveness beyond the initial ": connected" frame.
        const heartbeat = setInterval(() => {
          stream
            .write(": ping\n\n")
            .catch(() => finish("heartbeat_failed"));
        }, SSE_HEARTBEAT_INTERVAL_MS);

        stream.onAbort(() => finish("aborted"));

        // Replay persisted history. Wrapped so a DB read error or schema
        // parse failure surfaces an error frame and resolves the promise
        // instead of leaving the connection hanging with no terminal signal.
        void (async () => {
          try {
            const replay = listEvents(db, projectId, { afterSeq, limit: REPLAY_ROW_LIMIT });
            for (const envelope of replay) {
              await writeEnvelope(envelope);
            }
            replayDone = true;
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            console.error(
              `[onecompany] SSE replay failed for project ${projectId}: ${detail}`,
            );
            finish("replay_error");
          }
        })();
      });
    });
  });

  return router;
}
