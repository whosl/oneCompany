import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { getDbPath } from "@oc/shared";
import { createDefaultApp } from "./app.js";

loadEnv({ path: resolve(fileURLToPath(new URL("../../..", import.meta.url)), ".env") });

const { app } = createDefaultApp(getDbPath());
const port = 3001;

console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
