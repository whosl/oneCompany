import { serve } from "@hono/node-server";
import { getDbPath } from "@oc/shared";
import { createDefaultApp } from "./app.js";

const { app } = createDefaultApp(getDbPath());
const port = 3001;

console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
