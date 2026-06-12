import { Hono } from "hono";

type SessionLink = {
  projectId: string;
  sessionId: string;
  directory: string;
  role?: string;
  linkedAt: string;
};

const sessionLinks = new Map<string, SessionLink>();
const recentEvents: Array<{ at: string; body: unknown }> = [];
const MAX_EVENTS = 200;

export function createPluginRoutes() {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      version: "0.1.0",
      plugin: "onecompany-opencode",
    }),
  );

  app.post("/opencode/session-link", async (c) => {
    const body = await c.req.json<{
      projectId?: string;
      sessionId?: string;
      directory?: string;
      role?: string;
    }>();
    if (!body.projectId || !body.sessionId || !body.directory) {
      return c.json({ error: "projectId, sessionId, directory required" }, 400);
    }
    const link: SessionLink = {
      projectId: body.projectId,
      sessionId: body.sessionId,
      directory: body.directory,
      role: body.role,
      linkedAt: new Date().toISOString(),
    };
    sessionLinks.set(body.sessionId, link);
    sessionLinks.set(body.projectId, link);
    return c.json({ ok: true, link });
  });

  app.get("/opencode/session-link/:key", (c) => {
    const key = c.req.param("key");
    const link = sessionLinks.get(key);
    if (!link) {
      return c.json({ error: "not found" }, 404);
    }
    return c.json({ link });
  });

  app.post("/opencode/event", async (c) => {
    const body = await c.req.json<unknown>();
    recentEvents.push({ at: new Date().toISOString(), body });
    if (recentEvents.length > MAX_EVENTS) {
      recentEvents.splice(0, recentEvents.length - MAX_EVENTS);
    }
    return c.json({ ok: true });
  });

  app.get("/opencode/events/recent", (c) => {
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json({ events: recentEvents.slice(-limit) });
  });

  return app;
}
