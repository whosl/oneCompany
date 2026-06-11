#!/usr/bin/env node
import { ApiClient } from "./api.js";
import { runFullFlow } from "./flow.js";
import { createEventDisplayContext } from "./events.js";
import { createTuiView } from "./projection.js";
import { enterScreen, leaveScreen, pushLog, type RenderState, render } from "./render.js";
import type { CliOptions, Readiness } from "./types.js";

const DEFAULT_REQUIREMENT = [
  "设计一个 AI 面试助手。",
  "HR 可以创建岗位，上传或粘贴候选人简历，",
  "系统根据岗位要求生成面试问题，记录面试评价，并给出候选人匹配度建议。",
].join("");

function parseArgs(argv: string[]): CliOptions {
  let apiBase = process.env.API_BASE ?? "http://localhost:3001";
  let auto = false;
  let stub = false;
  let requirement = DEFAULT_REQUIREMENT;
  let projectName = "TUI Demo — AI Interview Assistant";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--auto") auto = true;
    else if (arg === "--stub") stub = true;
    else if (arg === "--api" && argv[i + 1]) {
      apiBase = argv[++i]!;
    } else if (arg === "--requirement" && argv[i + 1]) {
      requirement = argv[++i]!;
    } else if (arg === "--name" && argv[i + 1]) {
      projectName = argv[++i]!;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (stub) auto = true;

  return { apiBase, auto, stub, requirement, projectName };
}

function printHelp(): void {
  console.log(`
OneCompany TUI — drive the full generator flow from the terminal.

Usage:
  pnpm tui [--stub] [--auto] [--api URL] [--requirement TEXT] [--name NAME]

Options:
  --stub          Use stub engine profiles (requires API: OC_USE_STUB_ENGINE=1 OC_ALLOW_STUB=1)
  --auto          Auto-answer questions and resolve gates (default when --stub)
  --api URL       API base URL (default: http://localhost:3001)
  --requirement   Business requirement text
  --name          Project display name

Prerequisites:
  1. pnpm migrate
  2. pnpm --filter @oc/api dev   (port 3001)

Real engine (recommended):
  1. Fill .env: OC_LLM_API_KEY + OC_OPENCODE_MODEL_STRONG=zhipuai-coding-plan/glm-5.1
  2. pnpm --filter @oc/api dev
  3. pnpm tui
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const api = new ApiClient(options.apiBase);

  const ok = await api.health();
  if (!ok) {
    failTui(`API not reachable at ${options.apiBase}. Start: pnpm api (or docker compose up)`);
  }

  let readiness: Readiness;
  try {
    readiness = await api.readiness();
    assertRealEngineReady(readiness, options);
  } catch (error) {
    failTui(error instanceof Error ? error.message : String(error));
  }

  const state: RenderState = {
    connected: true,
    mode: "idle",
    logs: [],
    eventContext: createEventDisplayContext(),
    options,
    view: createTuiView(),
    startedAt: Date.now(),
    prompt: options.auto
      ? "Starting full flow (auto)…"
      : "Starting full flow (interactive)…",
  };

  enterScreen();
  render(state);

  state.stubProfilesEnabled = readiness.degradedModes?.includes("stub_engine") ?? false;
  if (options.stub && !state.stubProfilesEnabled) {
    pushLog(
      state,
      "info",
      "API is not in stub mode — restart with OC_USE_STUB_ENGINE=1 OC_ALLOW_STUB=1",
    );
  }
  pushReadiness(state, readiness);
  render(state);

  try {
    await runFullFlow(api, state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.mode = "error";
    state.prompt = message;
    render(state);
    leaveScreen();
    console.error(`\nTUI failed: ${message}`);
    process.exit(1);
  }

  leaveScreen();
  console.log(`\nProject: ${state.projectId}`);
  console.log(`Status:  ${state.projectStatus}`);
  console.log(`Web UI:  http://localhost:3000/projects/${state.projectId}`);
}

function pushReadiness(state: RenderState, readiness: Readiness): void {
  const llm = readiness.apiKeyReady || readiness.engine?.workflowLlmReady;
  const cli = readiness.engine?.opencodeCliReady;
  const model = readiness.engine?.opencodeModelReady;
  pushLog(
    state,
    "info",
    `readiness: llm=${llm ? "ok" : "missing"} opencode_cli=${cli ? "ok" : "missing"} opencode_model=${model ? "ok" : "missing"}`,
  );
  if (readiness.degradedModes?.length) {
    pushLog(state, "info", `degraded: ${readiness.degradedModes.join(", ")}`);
  }
}

function assertRealEngineReady(readiness: Readiness, options: CliOptions): void {
  if (options.stub) return;

  const issues: string[] = [];
  if (!(readiness.apiKeyReady || readiness.engine?.workflowLlmReady)) {
    issues.push("set OC_LLM_API_KEY in repo .env");
  }
  if (!readiness.engine?.opencodeCliReady) {
    const inDocker = readiness.workspaceRoot?.startsWith("/opt/onecompany");
    issues.push(
      inDocker
        ? "OpenCode CLI missing in Docker API — restart container (rebuild picks up docker-install-opencode.sh) or run: docker exec <container> bash /opt/onecompany/scripts/docker-install-opencode.sh"
        : "install opencode CLI or set OC_OPENCODE_BIN; restart API after `pnpm api`",
    );
  }
  if (!readiness.engine?.opencodeModelReady) {
    issues.push(
      "set OC_OPENCODE_MODEL_STRONG=provider/model in .env or configure ~/.local/share/opencode/auth.json",
    );
  }
  if (issues.length > 0) {
    throw new Error(`Engine not ready: ${issues.join("; ")}`);
  }
}

function failTui(message: string): never {
  console.error(`\nTUI failed: ${message}`);
  process.exit(1);
}

main().catch((error) => {
  leaveScreen();
  console.error(error);
  process.exit(1);
});
