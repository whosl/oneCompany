import { serve } from "@hono/node-server";
import type { EventEnvelope } from "@oc/shared";
import { Hono } from "hono";

// Compile-time wiring check for @oc/shared (used fully in M1).
type _SharedWiring = EventEnvelope;

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

const port = 3001;
console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
