import { Hono } from "hono";
import { emit, type Db, type EventEnvelope } from "@oc/shared";
import { steerHarnessSession } from "@oc/agent-core";

/**
 * POST /projects/:id/interrupt — deliver a user interjection into the live
 * coding session (queued as the agent's next instruction). `abort: true`
 * additionally cancels the current generation so the new info applies at once.
 *
 * Responds `{ delivered: false }` when no session is live, so the client can
 * fall back to a change request.
 */
export function createInterruptRoutes(db: Db, onEvent: (envelope: EventEnvelope) => void) {
  const router = new Hono();

  router.post("/:id/interrupt", async (c) => {
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return c.json({ error: "message is required" }, 400);
    }

    let delivered = false;
    try {
      delivered = await steerHarnessSession(projectId, message, {
        abort: body.abort === true,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return c.json({ error: `failed to deliver interjection: ${detail}` }, 502);
    }

    const envelope = emit(db, {
      projectId,
      payload: { type: "user.interjection", projectId, message, delivered },
    });
    onEvent(envelope);

    return c.json({ delivered });
  });

  return router;
}
