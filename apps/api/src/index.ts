import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
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

const { app, projects } = createDefaultApp(getDbPath());
const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? "0.0.0.0";

console.log(
  `[onecompany] Engine readiness: llm=${readiness.workflowLlmReady} opencode_cli=${readiness.opencodeCliReady} opencode_model=${readiness.opencodeModelReady}`,
);

// --- Startup: surface orphaned active-workflow projects -------------------
// Workflow runs (development slice loop, testing, deployment) live entirely
// in-process. A restart kills them silently, leaving the project stuck in an
// "active" status with nothing actually running. Scan once on boot and warn
// loudly so the operator knows to manually resume (e.g. "恢复开发" in the TUI).
const ORPHAN_STATUSES = new Set([
  "Developing",
  "Testing",
  "Deploying",
  "Asking Questions",
  "Tech Plan Review",
]);
const orphaned = projects
  .listProjects()
  .filter((project) => ORPHAN_STATUSES.has(project.status));
if (orphaned.length > 0) {
  console.warn(
    `[onecompany] WARNING: ${orphaned.length} project(s) were in an active workflow phase when the API restarted.`,
  );
  console.warn(
    "[onecompany] Their in-process runs died with the previous process. Resume them manually:",
  );
  for (const project of orphaned) {
    console.warn(`  - ${project.name} (${project.id}) — status: ${project.status}`);
  }
}

console.log(`API listening on http://${hostname}:${port}`);
// We always use plain HTTP (no createServer override), so narrow the union
// type to access closeAllConnections() which only exists on http.Server.
const server = serve({ fetch: app.fetch, hostname, port }) as Server;

// --- Graceful shutdown ----------------------------------------------------
// Docker sends SIGTERM (then SIGKILL after the grace period). Catch it so
// in-flight requests get a chance to finish and file-writing slices are not
// cut mid-write, leaving the generated repo in a half-baked state.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[onecompany] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log("[onecompany] HTTP server closed cleanly.");
    process.exit(0);
  });
  // Hard cap: if connections are still open after 10s, force-close them so
  // the process exits before docker's SIGKILL (default 10s grace → next signal).
  const forceTimer = setTimeout(() => {
    console.warn("[onecompany] forcing connection close after grace period.");
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  forceTimer.unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
