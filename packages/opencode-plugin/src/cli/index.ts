#!/usr/bin/env node
import { install } from "./install.js";
import { doctor } from "./doctor.js";
import { daemon } from "./daemon.js";

const [command, ...rest] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (command) {
    case "install":
      await install({ global: rest.includes("--global") || rest.includes("-g") });
      break;
    case "doctor":
      await doctor();
      break;
    case "daemon":
      await daemon();
      break;
    case undefined:
    case "help":
    case "--help":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
onecompany — OneCompany OpenCode plugin CLI

Usage:
  onecompany install [--global]   Patch opencode.json + tui.json with plugins
  onecompany doctor               Check sidecar, OpenCode CLI, plugin paths
  onecompany daemon               Start OneCompany API sidecar (monorepo dev)

Environment:
  ONECOMPANY_API_URL / OC_API_URL / API_URL   Sidecar base URL (default http://127.0.0.1:3001)
`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
