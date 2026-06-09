import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, type Db } from "@oc/shared";
import { resetGraphCheckpointerForTests } from "@oc/workflow";
import { createApp } from "./app.js";
import { resetBroadcasts } from "./events/broadcast.js";
import type { GateService } from "./gates/service.js";
import type { ProjectService } from "./projects/service.js";
import type { WorkspaceService } from "./workspace/service.js";

export function setupTestApp(): {
  app: ReturnType<typeof createApp>["app"];
  db: Db;
  projects: ProjectService;
  gates: GateService;
  workspace: WorkspaceService;
  generatedProjectsRoot: string;
  cleanup: () => void;
} {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oc-api-test-"));
  const dbPath = path.join(tempDir, "app.sqlite");
  const generatedProjectsRoot = path.join(tempDir, "generated-projects");
  process.env.OC_TEST_DB_PATH = dbPath;
  process.env.OC_GENERATED_PROJECTS_ROOT = generatedProjectsRoot;
  process.env.OC_USE_STUB_ENGINE = "1";

  execSync("pnpm exec drizzle-kit push", {
    cwd: path.resolve(process.cwd(), "../../packages/shared"),
    env: { ...process.env, OC_TEST_DB_PATH: dbPath },
    stdio: "pipe",
  });

  resetBroadcasts();
  resetGraphCheckpointerForTests();
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
      resetGraphCheckpointerForTests();
      delete process.env.OC_TEST_DB_PATH;
      delete process.env.OC_GENERATED_PROJECTS_ROOT;
      delete process.env.OC_USE_STUB_ENGINE;
      rmSync(tempDir, { recursive: true, force: true });
      resetBroadcasts();
    },
  };
}
