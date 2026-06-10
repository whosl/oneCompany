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
    "[onecompany] OpenCode CLI not found. Coding slices will fail until opencode is installed or OC_OPENCODE_BIN is set.",
  );
} else if (opencodeBin && opencodeBin !== "opencode") {
  console.log(`[onecompany] OpenCode CLI: ${opencodeBin}`);
}
if (!readiness.opencodeModelReady) {
  console.warn(
    "[onecompany] OpenCode model not configured. Set OC_OPENCODE_MODEL_STRONG=provider/model or configure ~/.local/share/opencode/auth.json.",
  );
}

const { app } = createDefaultApp(getDbPath());
const port = Number(process.env.PORT ?? 3001);

console.log(
  `[onecompany] Engine readiness: llm=${readiness.workflowLlmReady} opencode_cli=${readiness.opencodeCliReady} opencode_model=${readiness.opencodeModelReady}`,
);
console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
