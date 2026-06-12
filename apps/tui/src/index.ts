#!/usr/bin/env node
import { App } from "./app.js";
import { leaveScreen } from "./render.js";
import type { TuiOptions } from "./types.js";
import type { TuiTheme } from "./theme.js";
import { parseTheme } from "./theme.js";

function parseArgs(argv: string[]): TuiOptions {
  let apiBase = process.env.API_BASE ?? "http://localhost:3001";
  let stub = false;
  let projectId: string | undefined;
  let theme: TuiTheme | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--stub") stub = true;
    else if (arg === "--api" && argv[i + 1]) apiBase = argv[++i]!;
    else if (arg === "--project" && argv[i + 1]) projectId = argv[++i]!;
    else if (arg === "--theme" && argv[i + 1]) theme = parseTheme(argv[++i]!);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { apiBase, stub, projectId, theme };
}

function printHelp(): void {
  console.log(`
OneCompany TUI v2 — interactive console for the full delivery pipeline.

Usage:
  pnpm tui2 [--api URL] [--project ID] [--theme dark|light] [--stub]

Options:
  --api URL      API base URL (default: http://localhost:3001, or $API_BASE)
  --project ID   Open a project directly, skipping the project hub
  --theme MODE   Taizi panel theme: dark (default) or light
  --stub         Use stub engine profiles (requires API started with
                 OC_USE_STUB_ENGINE=1 OC_ALLOW_STUB=1)

Screens:
  Project hub    list / create / open projects
  Console        agents · timeline · inspector · composer

Console keys:
  Tab            cycle focus (composer → timeline → agents)
  Enter          submit input / resolve gate / pin agent
  1-9            pick gate option or suggested answer
  ↑↓ PgUp PgDn   scroll timeline / select agent / gate option
  ^P             pause / resume project
  ^R             refresh snapshot
  m              toggle dark / light theme (Taizi panel)
  ^B             back to project hub
  q / ^C         quit

Prerequisites:
  pnpm migrate && pnpm api   (port 3001)
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const app = new App(options);

  const bail = (error: unknown): never => {
    leaveScreen();
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  };

  process.on("uncaughtException", bail);
  process.on("unhandledRejection", bail);

  await app.start();
}

void main();
