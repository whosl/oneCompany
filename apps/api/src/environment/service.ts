import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getEngineReadiness } from "@oc/agent-core";
import { getDbPath, isDegradedStubMode } from "@oc/shared";
import { getGeneratedProjectsRoot } from "@oc/workspace";
import type { EnvironmentReadiness } from "@oc/shared";

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function createEnvironmentService() {
  return {
    getReadiness(): EnvironmentReadiness {
      const workspaceRoot = process.cwd();
      const generatedProjectsRoot = getGeneratedProjectsRoot();
      const databasePath = getDbPath();
      const engine = getEngineReadiness();
      const apiKeyReady = engine.workflowLlmReady;
      const tunnelConfigured = Boolean(
        process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim() ||
          process.env.CLOUDFLARE_TUNNEL_URL?.trim(),
      );

      const degradedModes: string[] = [];
      if (process.env.OC_USE_STUB_ENGINE === "1") {
        degradedModes.push("stub_engine");
      }
      if (process.env.OC_TESTING_FIXTURE === "1") {
        degradedModes.push("testing_fixture");
      }

      return {
        workspaceRoot,
        generatedProjectsRoot,
        databasePath,
        apiKeyReady,
        engine,
        tunnelConfigured,
        degradedModes: isDegradedStubMode() ? degradedModes : undefined,
        checks: {
          node: commandExists("node"),
          pnpm: commandExists("pnpm"),
          git: commandExists("git"),
          docker: commandExists("docker"),
          playwright: fs.existsSync(path.join(workspaceRoot, "node_modules", "playwright")),
          sqlite: fs.existsSync(databasePath),
        },
        policies: [
          "Automatic model routing (read-only)",
          "Fixed sandbox policy (read-only)",
          "Governed shell risk grading (read-only)",
          "Secret redaction enabled (read-only)",
        ],
      };
    },
  };
}

export type EnvironmentService = ReturnType<typeof createEnvironmentService>;
