import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { ensureOpencodeOnPath, getEngineReadiness } from "@oc/agent-core";
import { getDbPath } from "@oc/shared";
import { createDefaultApp } from "./app.js";

loadEnv({ path: resolve(fileURLToPath(new URL("../../..", import.meta.url)), ".env") });

const opencodeBin = ensureOpencodeOnPath();
const readiness = getEngineReadiness();
if (!readiness.opencodeCliReady) {
  console.warn(
    "[onecompany] Coding CLI not found. Install mimo (or opencode) or set OC_OPENCODE_BIN before running slices.",
  );
} else if (opencodeBin) {
  console.log(`[onecompany] Coding CLI: ${opencodeBin}`);
}
if (!readiness.opencodeModelReady) {
  console.warn(
    "[onecompany] Coding model not configured. Set OC_OPENCODE_MODEL_STRONG=provider/model or configure ~/.local/share/mimocode/auth.json (mimo) or opencode/auth.json.",
  );
}

const { app } = createDefaultApp(getDbPath());
const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? "0.0.0.0";

console.log(
  `[onecompany] Engine readiness: llm=${readiness.workflowLlmReady} opencode_cli=${readiness.opencodeCliReady} opencode_model=${readiness.opencodeModelReady}`,
);
console.log(`API listening on http://${hostname}:${port}`);
serve({ fetch: app.fetch, hostname, port });
