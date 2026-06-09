import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createDb, type Db } from "@oc/shared";

loadEnv({ path: path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)), ".env") });
import { createApp } from "../app.js";
import { resetBroadcasts } from "../events/broadcast.js";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function setupIntegrationApp(): {
  app: ReturnType<typeof createApp>["app"];
  db: Db;
  projects: ProjectService;
  gates: GateService;
  workspace: WorkspaceService;
  generatedProjectsRoot: string;
  cleanup: () => void;
} {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oc-api-integration-"));
  const dbPath = path.join(tempDir, "app.sqlite");
  const generatedProjectsRoot = path.join(tempDir, "generated-projects");
  process.env.OC_TEST_DB_PATH = dbPath;
  process.env.OC_GENERATED_PROJECTS_ROOT = generatedProjectsRoot;
  delete process.env.OC_USE_STUB_ENGINE;
  process.env.OC_OPENCODE_SLICE_TIMEOUT_MS ??= "180000";

  execSync("pnpm exec drizzle-kit push", {
    cwd: path.resolve(process.cwd(), "../../packages/shared"),
    env: { ...process.env, OC_TEST_DB_PATH: dbPath },
    stdio: "pipe",
  });

  resetBroadcasts();
  const db = createDb(dbPath);
  const { app, projects, gates, workspace } = createApp({
    db,
    generatedProjectsRoot,
  });

  return {
    app,
    db,
    projects,
    gates,
    workspace,
    generatedProjectsRoot,
    cleanup: () => {
      delete process.env.OC_TEST_DB_PATH;
      delete process.env.OC_GENERATED_PROJECTS_ROOT;
      delete process.env.OC_OPENCODE_SLICE_TIMEOUT_MS;
      rmSync(tempDir, { recursive: true, force: true });
      resetBroadcasts();
    },
  };
}
