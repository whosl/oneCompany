import pc from "picocolors";
import {
  GATE_OPTION_LABELS,
  GROUP_LABEL,
  LIFECYCLE_STEPS,
  gateDefinition,
  lifecycleIndex,
  toolInProgressSuffix,
  toolVerb,
} from "./catalog.js";
import { buildAgentThreadTask, buildCodexStream } from "./codex-stream.js";
import { buildFileTree, filterRepoPaths, flattenFileTree } from "./file-tree.js";
import { renderMarkdownLines } from "./markdown.js";
import {
  agentWorkMs,
  filterPaletteActions,
  filterTimelineForAgentFocus,
  isPreviewDeployed,
  isProjectDeployReady,
  pushTaiziReply,
  type AgentStatus,
  type AgentView,
  type AgentPaorEntry,
  type ConsoleState,
  type FocusZone,
  type TimelineEntry,
  type TodoItem,
} from "./store.js";
import { clipW, padW, strWidth, wrapPreservingNewlines, wrapW } from "./text.js";
import type { ProjectRecord } from "./types.js";

/* ------------------------------------------------------------------ */
/* Screen control (incl. SGR mouse tracking)                            */
/* ------------------------------------------------------------------ */

let alternate = false;

export function enterScreen(): void {
  if (!alternate) {
    process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h");
    alternate = true;
  }
}

export function leaveScreen(): void {
  if (alternate) {
    process.stdout.write("\x1b[?1006l\x1b[?1000l\x1b[?1049l\x1b[?25h");
    alternate = false;
  }
}

function paint(lines: string[]): void {
  if (!alternate) enterScreen();
  const rows = process.stdout.rows || 40;
  // Absolute cursor positioning per row: even if one line overflows the
  // terminal width (emoji width quirks etc.), subsequent rows stay aligned
  // with the hitmap instead of being pushed down by a soft wrap.
  let out = "\x1b[2J";
  const count = Math.min(lines.length, rows - 1);
  for (let i = 0; i < count; i += 1) {
    out += `\x1b[${i + 1};1H${lines[i]}`;
  }
  process.stdout.write(out);
}

function termSize(): { cols: number; rows: number } {
  return {
    cols: Math.max(84, process.stdout.columns || 120),
    rows: Math.max(24, process.stdout.rows || 40),
  };
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function spinner(): string {
  return SPINNER[Math.floor(Date.now() / 90) % SPINNER.length]!;
}

function elapsed(startedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Click hit-map                                                        */
/* ------------------------------------------------------------------ */

export type Hit =
  | { type: "open_project"; id: string }
  | { type: "select_agent"; id: string }
  | { type: "timeline_focus_back" }
  | { type: "toggle_turn"; id: string; expanded: boolean }
  | { type: "gate_option"; index: number }
  | { type: "suggestion"; index: number }
  | { type: "action"; id: string }
  | { type: "palette_action"; id: string }
  | { type: "open_artifact"; path: string }
  | { type: "open_file"; path: string }
  | { type: "toggle_file_dir"; path: string }
  | { type: "focus"; zone: FocusZone }
  | { type: "skip_clarification" }
  | { type: "question_prev" }
  | { type: "question_next" }
  | { type: "inspector_tab"; tab: "artifacts" | "files" };

type Region = { x1: number; y1: number; x2: number; y2: number; hit: Hit };

let regions: Region[] = [];
let streamRect = { x1: -1, y1: -1, x2: -1, y2: -1 };
let inspectorFilesRect = { x1: -1, y1: -1, x2: -1, y2: -1 };

function resetHits(): void {
  regions = [];
  streamRect = { x1: -1, y1: -1, x2: -1, y2: -1 };
  inspectorFilesRect = { x1: -1, y1: -1, x2: -1, y2: -1 };
}

function addHit(x: number, y: number, w: number, h: number, hit: Hit): void {
  regions.push({ x1: x, y1: y, x2: x + w - 1, y2: y + h - 1, hit });
}

/** Most-specific (last registered) region wins. */
export function hitTest(x: number, y: number): Hit | undefined {
  for (let i = regions.length - 1; i >= 0; i -= 1) {
    const r = regions[i]!;
    if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return r.hit;
  }
  return undefined;
}

export function inStream(x: number, y: number): boolean {
  return x >= streamRect.x1 && x <= streamRect.x2 && y >= streamRect.y1 && y <= streamRect.y2;
}

export function inInspectorFiles(x: number, y: number): boolean {
  return (
    x >= inspectorFilesRect.x1 &&
    x <= inspectorFilesRect.x2 &&
    y >= inspectorFilesRect.y1 &&
    y <= inspectorFilesRect.y2
  );
}

/* ------------------------------------------------------------------ */
/* Palettes                                                             */
/* ------------------------------------------------------------------ */

function statusBadge(status: string): string {
  const text = ` ${status} `;
  switch (status) {
    case "Draft Requirement":
    case "Asking Questions":
      return pc.bgCyan(pc.black(text));
    case "PRD Ready":
    case "Delivered":
      return pc.bgGreen(pc.black(text));
    case "Tech Plan Review":
    case "Change Review":
    case "Awaiting Acceptance":
      return pc.bgYellow(pc.black(text));
    case "Developing":
    case "Testing":
    case "Deploying":
      return pc.bgBlue(pc.white(text));
    case "Failed":
      return pc.bgRed(pc.white(text));
    case "Paused":
      return pc.bgMagenta(pc.white(text));
    default:
      return pc.inverse(text);
  }
}

function agentGlyph(status: AgentStatus): string {
  switch (status) {
    case "running":
      return pc.cyan(spinner());
    case "tool":
      return pc.magenta(spinner());
    case "blocked":
      return pc.yellow("◆");
    case "done":
      return pc.green("●");
    case "failed":
      return pc.red("●");
    case "waiting":
      return pc.white("○");
    default:
      return pc.dim("·");
  }
}

function activeSeconds(agent: AgentView): string {
  if (!agent.activeSinceMs) return "";
  const sec = Math.floor((Date.now() - agent.activeSinceMs) / 1000);
  return sec < 1 ? "" : sec < 600 ? ` ${sec}s` : ` ${Math.floor(sec / 60)}m`;
}

function agentStatusWord(status: AgentStatus, agent?: AgentView): string {
  switch (status) {
    case "running":
      return pc.cyan(`run${agent ? activeSeconds(agent) : ""}`);
    case "tool":
      return pc.magenta(`tool${agent ? activeSeconds(agent) : ""}`);
    case "blocked":
      return pc.yellow("gate");
    case "done":
      return pc.green("done");
    case "failed":
      return pc.red("fail");
    case "waiting":
      return pc.dim("wait");
    default:
      return pc.dim("idle");
  }
}

/* ------------------------------------------------------------------ */
/* Header                                                               */
/* ------------------------------------------------------------------ */

function buildHeader(state: ConsoleState, width: number): string[] {
  const snapshot = state.snapshot;
  const name = snapshot?.project.name ?? state.projectId;
  const status = snapshot?.project.status ?? "…";

  // Big title: DECDWL double-width line (renders at 2x size in iTerm2 /
  // Terminal.app; harmless plain line elsewhere). Content budget = width/2.
  const bigW = Math.floor(width / 2);
  const bigLine =
    "\x1b#6" +
    padW(
      ` ${pc.bold(pc.cyan("⬢ OneCompany"))} ${pc.dim("·")} ${pc.bold(clipW(name, Math.max(8, bigW - 17)))}`,
      bigW,
    );

  const busyNote = state.busy.size
    ? pc.cyan(`${spinner()} ${[...state.busy][0]!.split(":")[0]}${state.busy.size > 1 ? ` +${state.busy.size - 1}` : ""}`)
    : "";
  const conn = state.sseConnected ? pc.green("● live") : pc.red("○ offline");
  const yolo = state.yoloMode ? pc.yellow(" ⚡YOLO") : "";
  const themeTag =
    state.theme === "dark" ? pc.dim(" 🌙") : pc.dim(" ☀");
  const right = `${busyNote}${yolo}${themeTag}  ${pc.dim(elapsed(state.startedAt))}  ${conn} `;

  const left = ` ${statusBadge(status)}`;
  const gap = Math.max(1, width - strWidth(left) - strWidth(right));
  const line1 = left + " ".repeat(gap) + right;

  const index = lifecycleIndex(status);
  const parts: string[] = [];
  for (let i = 0; i < LIFECYCLE_STEPS.length; i += 1) {
    const step = LIFECYCLE_STEPS[i]!;
    if (index !== -1 && (i < index || status === "Delivered")) {
      parts.push(`${pc.green("●")} ${pc.dim(step.label)}`);
    } else if (i === index) {
      parts.push(`${pc.cyan("◉")} ${pc.bold(pc.cyan(step.label))}`);
    } else {
      parts.push(`${pc.dim("○")} ${pc.dim(step.label)}`);
    }
  }
  let stepper = ` ${parts.join(pc.dim(" ── "))}`;
  if (status === "Failed") stepper += `  ${pc.red("▾ failed")}`;
  if (status === "Paused") stepper += `  ${pc.magenta("▾ paused")}`;

  const progress = snapshot?.phase.progressLabel
    ? pc.dim(`${snapshot.phase.label} · ${snapshot.phase.progressLabel} `)
    : pc.dim(`${snapshot?.phase.label ?? ""} `);
  const gap2 = Math.max(1, width - strWidth(stepper) - strWidth(progress));
  const line2 = stepper + " ".repeat(gap2) + progress;

  return [bigLine, padW(line1, width), padW(line2, width), pc.dim("─".repeat(width))];
}

/* ------------------------------------------------------------------ */
/* Left column: roster + agent detail card                              */
/* ------------------------------------------------------------------ */

export function rosterOrder(state: ConsoleState): AgentView[] {
  const all = [...state.agents.values()];
  return [
    ...all.filter((a) => a.group === "requirement"),
    ...all.filter((a) => a.group === "development"),
  ];
}

type HitLine = {
  text: string;
  hit?: Hit;
  hits?: Array<{ x: number; w: number; hit: Hit }>;
};

function buildAgentsColumn(state: ConsoleState, width: number, height: number): HitLine[] {
  const lines: HitLine[] = [];
  const roster = rosterOrder(state);
  const focused = state.focus === "agents";

  lines.push({ text: padW(pc.bold(pc.cyan(" AGENTS")), width) });

  let lastGroup = "";
  roster.forEach((agent, i) => {
    if (lines.length >= height) return;
    if (agent.group !== lastGroup) {
      lastGroup = agent.group;
      lines.push({
        text: padW(pc.dim(`─ ${GROUP_LABEL[agent.group]} `.padEnd(width - 1, "─")), width),
      });
    }
    if (lines.length >= height) return;

    const selected = focused && i === state.agentCursor;
    const pinned = state.inspectorAgentId === agent.id;
    const focusedStream = state.timelineFocusAgentId === agent.id;
    const cursor = selected ? pc.cyan("▸") : focusedStream ? pc.cyan("◆") : pinned ? pc.cyan("·") : " ";
    const nameRaw = clipW(agent.name, width - 11);
    const name = selected ? pc.inverse(` ${nameRaw} `) : ` ${nameRaw} `;
    const word = agentStatusWord(agent.status, agent);
    const head = `${cursor}${agentGlyph(agent.status)}${name}`;
    const gap = Math.max(0, width - strWidth(head) - strWidth(word) - 1);
    lines.push({
      text: padW(head + " ".repeat(gap) + word + " ", width),
      hit: { type: "select_agent", id: agent.id },
    });
  });

  // Agent detail card below the roster.
  const detail =
    (state.inspectorAgentId && state.agents.get(state.inspectorAgentId)) ||
    (focused && roster[state.agentCursor]) ||
    (state.lastAgentId && state.agents.get(state.lastAgentId)) ||
    undefined;

  if (detail && lines.length < height - 3) {
    lines.push({ text: padW(pc.dim(`─ DETAIL `.padEnd(width - 1, "─")), width) });
    const word = agentStatusWord(detail.status, detail);
    const head = `${agentGlyph(detail.status)} ${pc.bold(clipW(detail.name, width - 8))}`;
    const gap = Math.max(1, width - strWidth(head) - strWidth(word) - 1);
    lines.push({ text: padW(head + " ".repeat(gap) + word, width) });
    lines.push({ text: padW(pc.dim(clipW(detail.role, width - 1)), width) });

    const pushWrapped = (
      label: string,
      value: string,
      maxLines: number,
      tintFn: (s: string) => string = (s) => s,
    ): void => {
      const wrapped = wrapW(value, width - 6, maxLines);
      lines.push({ text: padW(`${pc.cyan(label)}  ${tintFn(wrapped[0] ?? "")}`, width) });
      for (const cont of wrapped.slice(1)) {
        if (lines.length >= height) break;
        lines.push({ text: padW(`      ${tintFn(cont)}`, width) });
      }
    };

    // 职责简介
    if (detail.description) pushWrapped("职责", detail.description, 2);

    // 能力（skill / 工具 / 引擎）
    for (const [i, cap] of detail.capabilities.entries()) {
      if (lines.length >= height - 2) break;
      const wrapped = wrapW(cap, width - 8, 2);
      lines.push({
        text: padW(`${i === 0 ? pc.cyan("能力") : "    "}  ${pc.dim("·")} ${wrapped[0] ?? ""}`, width),
      });
      for (const cont of wrapped.slice(1)) {
        lines.push({ text: padW(`        ${cont}`, width) });
      }
    }

    // 工作简报：工时 / 工具调用 / 产物 / 步骤 / 错误
    const workSec = Math.floor(agentWorkMs(detail) / 1000);
    const workLabel =
      workSec >= 3600
        ? `${Math.floor(workSec / 3600)}h${Math.floor((workSec % 3600) / 60)}m`
        : workSec >= 60
          ? `${Math.floor(workSec / 60)}m${workSec % 60}s`
          : `${workSec}s`;
    const errPart = detail.errors > 0 ? ` · ${pc.red(`错误 ${detail.errors}`)}` : "";
    pushWrapped(
      "简报",
      `工时 ${workLabel} · 工具 ${detail.toolRuns} 次 · 产物 ${detail.artifactCount} · 步骤 ${detail.steps}`,
      2,
    );
    if (errPart && lines.length < height) {
      lines.push({ text: padW(`      ${pc.red(`错误 ${detail.errors} 次`)}`, width) });
    }

    // Reserve rows for recent tool calls; PAOR history uses the rest.
    const agentTools = state.toolCalls.filter((tc) => tc.agentId === detail.id);
    const tools = agentTools.slice(-3);
    const paorBudget = height - tools.length;

    if (lines.length < paorBudget && detail.paorLog.length > 0) {
      lines.push({
        text: padW(
          pc.dim(`─ 历史 · ${detail.paorLog.length} 条 `.padEnd(width - 1, "─")),
          width,
        ),
      });
      const PAOR_PHASE_LABEL: Record<AgentPaorEntry["phase"], string> = {
        plan: "计划",
        act: "执行",
        observe: "观察",
        reflect: "反思",
        progress: "进度",
      };
      const visible: AgentPaorEntry[] = [];
      let usedRows = 0;
      for (let i = detail.paorLog.length - 1; i >= 0; i -= 1) {
        const entry = detail.paorLog[i]!;
        const wrapped = wrapW(entry.text, width - 7, 4);
        const blockRows = 1 + wrapped.length;
        if (usedRows + blockRows > paorBudget - lines.length) break;
        visible.unshift(entry);
        usedRows += blockRows;
      }
      for (const entry of visible) {
        if (lines.length >= paorBudget) break;
        const label = PAOR_PHASE_LABEL[entry.phase];
        const wrapped = wrapW(entry.text, width - 7, 4);
        const time = entry.at ? pc.dim(` ${entry.at.slice(11, 19)}`) : "";
        lines.push({
          text: padW(`${pc.cyan(label)}${time}  ${wrapped[0] ?? ""}`, width),
        });
        for (const cont of wrapped.slice(1)) {
          if (lines.length >= paorBudget) break;
          lines.push({ text: padW(`      ${cont}`, width) });
        }
      }
      if (detail.paorLog.length > visible.length && lines.length < paorBudget) {
        lines.push({
          text: padW(
            pc.dim(`      … 另有 ${detail.paorLog.length - visible.length} 条，见信息流`),
            width,
          ),
        });
      }
    } else if (lines.length < paorBudget) {
      lines.push({ text: padW(pc.dim(`─ PAOR `.padEnd(width - 1, "─")), width) });
      const sections: Array<[string, string | undefined]> = [
        ["计划", detail.plan],
        ["执行", detail.act],
        ["观察", detail.observe],
        ["反思", detail.reflect],
      ];
      for (const [label, value] of sections) {
        if (!value || lines.length >= paorBudget) continue;
        const wrapped = wrapW(value, width - 7, 99);
        lines.push({ text: padW(`${pc.cyan(label)}  ${wrapped[0] ?? ""}`, width) });
        for (const cont of wrapped.slice(1)) {
          if (lines.length >= paorBudget) break;
          lines.push({ text: padW(`      ${cont}`, width) });
        }
      }
    }

    for (const tool of tools) {
      if (lines.length >= height) break;
      const mark =
        tool.status === "ok"
          ? pc.green("✓")
          : tool.status === "failed"
            ? pc.red("✗")
            : pc.cyan(toolInProgressSuffix(tool.toolName));
      const duration = tool.endedAt
        ? pc.dim(` ${((tool.endedAt - tool.startedAt) / 1000).toFixed(1)}s`)
        : "";
      const label = tool.summary
        ? `${toolVerb(tool.toolName)} ${tool.summary}`
        : toolVerb(tool.toolName);
      lines.push({
        text: padW(`${pc.magenta("⚙")} ${clipW(label, width - 9)} ${mark}${duration}`, width),
      });
    }
  }

  while (lines.length < height) lines.push({ text: " ".repeat(width) });
  return lines.slice(0, height);
}

/* ------------------------------------------------------------------ */
/* Stream (Claude-Code-style message flow)                              */
/* ------------------------------------------------------------------ */

const REASON_LABEL: Record<string, string> = {
  PLAN: "计划",
  ACT: "执行",
  OBSRV: "观察",
  REFLT: "反思",
};

/** "运行命令 pnpm test (bash)" — Chinese verb + args summary + raw tool name. */
function toolTitle(entry: TimelineEntry, width: number): string {
  const verb = toolVerb(entry.tool ?? "tool");
  const summary = entry.toolSummary
    ? ` ${clipW(entry.toolSummary, Math.max(8, width - strWidth(verb) - 14))}`
    : "";
  const raw =
    entry.tool && verb !== entry.tool ? ` ${pc.dim(`(${entry.tool})`)}` : "";
  const repeat = entry.repeat && entry.repeat > 1 ? pc.yellow(` ×${entry.repeat}`) : "";
  return `${pc.bold(verb)}${pc.cyan(summary)}${raw}${repeat}`;
}

/** Typewriter reveal for live entries (chars per second). */
const REVEAL_CPS = 100;

function reveal(entry: TimelineEntry, text: string): string {
  if (!entry.bornAtMs) return text;
  const visible = Math.floor(((Date.now() - entry.bornAtMs) / 1000) * REVEAL_CPS);
  const chars = [...text];
  if (visible >= chars.length) return text;
  return `${chars.slice(0, Math.max(0, visible)).join("")}▌`;
}

/** Show tool output body only when it carries actionable failure info. */
function showToolOutput(entry: TimelineEntry): boolean {
  if (entry.kind === "tool_err") return true;
  if (entry.kind !== "tool_ok" || !entry.text.trim()) return false;
  const tool = (entry.tool ?? "").toLowerCase();
  if (tool === "bash" || tool === "shell") {
    return /error|fail|not permitted|cannot|denied|exit code: [1-9]/i.test(entry.text);
  }
  return false;
}

function todoStatusIcon(status: TodoItem["status"]): string {
  switch (status) {
    case "completed":
      return pc.green("☑");
    case "in_progress":
      return pc.cyan("◔");
    case "cancelled":
      return pc.dim("☒");
    default:
      return pc.dim("☐");
  }
}

/** Agent todo list pinned above the live-status footer. */
function buildTodoPanel(state: ConsoleState, width: number): HitLine[] {
  if (!state.todos.length) return [];
  const inner = width - 4;
  const lines: HitLine[] = [
    { text: "" },
    { text: `  ${pc.bold(pc.magenta("📋 任务清单"))}` },
  ];
  for (const item of state.todos.slice(0, 8)) {
    const icon = todoStatusIcon(item.status);
    const pri =
      item.priority === "high"
        ? pc.red("!")
        : item.priority === "medium"
          ? pc.yellow("·")
          : "";
    const label =
      item.status === "completed"
        ? pc.dim(pc.strikethrough(clipW(item.content, inner - 6)))
        : item.status === "in_progress"
          ? pc.bold(clipW(item.content, inner - 6))
          : pc.dim(clipW(item.content, inner - 6));
    lines.push({ text: `    ${icon} ${pri}${label}` });
  }
  if (state.todos.length > 8) {
    lines.push({ text: pc.dim(`    … 还有 ${state.todos.length - 8} 项`) });
  }
  return lines;
}

function boxTop(title: string, tint: (s: string) => string, width: number): string {
  const label = ` ${title} `;
  const fill = Math.max(0, width - strWidth(label) - 3);
  return tint(`╭─${label}${"─".repeat(fill)}╮`);
}

function boxRow(content: string, tint: (s: string) => string, width: number): string {
  return `${tint("│")} ${padW(content, width - 4)} ${tint("│")}`;
}

function boxBottom(tint: (s: string) => string, width: number): string {
  return tint(`╰${"─".repeat(width - 2)}╯`);
}

/** Materials the user should review before deciding a gate (open in viewer). */
function gateReviewLinks(
  state: ConsoleState,
  gateType: string,
): Array<{ label: string; path: string }> {
  const pid = state.projectId;
  switch (gateType) {
    case "requirement_confirm":
      return [
        { label: "查看 PRD", path: `artifacts/${pid}/prd-latest.md` },
        { label: "查看验收标准", path: `artifacts/${pid}/ac-latest.md` },
      ];
    case "tech_plan_confirm":
      return [
        { label: "查看技术方案", path: `artifacts/${pid}/tp-latest.md` },
        { label: "查看 PRD", path: `artifacts/${pid}/prd-latest.md` },
      ];
    case "final_acceptance": {
      const report = [...state.artifacts].reverse().find((p) => /report|delivery/i.test(p));
      return [
        ...(report ? [{ label: "查看交付报告", path: report }] : []),
        { label: "查看 PRD", path: `artifacts/${pid}/prd-latest.md` },
        { label: "查看验收标准", path: `artifacts/${pid}/ac-latest.md` },
      ];
    }
    default:
      return [];
  }
}

/** Inline permission card for the blocking gate (Claude-Code style). */
function buildGateBox(state: ConsoleState, width: number): HitLine[] {
  const gate = state.snapshot?.openGates[0];
  if (!gate) return [];
  const def = gateDefinition(gate.gateType);
  const options = gate.options.length ? gate.options : def.options;
  const composer = state.composer;
  const tint = pc.yellow;
  const lines: HitLine[] = [{ text: "" }];

  lines.push({ text: boxTop(`⛔ ${def.title}`, tint, width) });
  for (const text of wrapW(def.description, width - 4, 2)) {
    lines.push({ text: boxRow(pc.dim(text), tint, width) });
  }
  if (state.yoloMode && gate.gateType === "dangerous_operation") {
    lines.push({
      text: boxRow(pc.yellow("⚡ YOLO 已开启 — 将自动放行（按 y 可关闭）"), tint, width),
    });
  }

  // What exactly is being confirmed (dangerous op command / integration tool).
  const meta = (gate.metadata ?? {}) as Record<string, unknown>;
  const operation = typeof meta.operation === "string" ? meta.operation : undefined;
  const metaTool = typeof meta.toolName === "string" ? meta.toolName : undefined;
  const integrationId = typeof meta.integrationId === "string" ? meta.integrationId : undefined;
  const riskLevel = typeof meta.riskLevel === "string" ? meta.riskLevel : undefined;
  if (operation || metaTool || riskLevel) {
    if (operation) {
      const [first, ...rest] = wrapW(operation, width - 14, 3);
      lines.push({ text: boxRow(`${pc.bold("具体操作")}  ${pc.bold(pc.red(first ?? ""))}`, tint, width) });
      for (const cont of rest) {
        lines.push({ text: boxRow(`          ${pc.red(cont)}`, tint, width) });
      }
    }
    if (metaTool) {
      lines.push({
        text: boxRow(
          `${pc.bold("调用工具")}  ${metaTool}${integrationId ? pc.dim(`（集成：${integrationId}）`) : ""}`,
          tint,
          width,
        ),
      });
    }
    if (riskLevel) {
      const riskZh = riskLevel === "high" ? pc.red("高") : riskLevel === "medium" ? pc.yellow("中") : pc.green("低");
      lines.push({ text: boxRow(`${pc.bold("风险等级")}  ${riskZh}`, tint, width) });
    }
    lines.push({ text: boxRow("", tint, width) });
  }
  const links = gateReviewLinks(state, gate.gateType);
  if (links.length > 0) {
    lines.push({ text: boxRow(pc.dim("review 材料:"), tint, width) });
    for (const link of links) {
      lines.push({
        text: boxRow(
          `  ${pc.cyan("▤")} ${pc.cyan(pc.underline(link.label))} ${pc.dim("— 点击在浮层中查看")}`,
          tint,
          width,
        ),
        hit: { type: "open_artifact", path: link.path },
      });
    }
    lines.push({ text: boxRow("", tint, width) });
  }
  if (gate.gateType === "requirement_stuck" && state.snapshot?.requirement) {
    const score = state.snapshot.requirement.completenessScore;
    const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);
    lines.push({
      text: boxRow(pc.yellow(`当前完成度 ${pct}%，仍未达标 — 你想怎么继续？`), tint, width),
    });
  }
  if (gate.gateType === "deployment") {
    const preview =
      state.snapshot?.dev?.previewUrl ?? state.snapshot?.testing?.previewUrl ?? composer.input.trim();
    if (preview) {
      lines.push({
        text: boxRow(
          `${pc.bold("Preview URL")}  ${pc.cyan(preview)} ${pc.dim("（测试阶段已生成，Enter 确认放行）")}`,
          tint,
          width,
        ),
      });
    } else {
      lines.push({
        text: boxRow(pc.yellow("请先输入部署 URL，Enter 确认后再选「通过」"), tint, width),
      });
    }
  }
  options.forEach((option, i) => {
    const active = composer.gateId === gate.id && composer.gateCursor === i;
    const zh =
      gate.gateType === "final_acceptance" && option === "reject_and_redo"
        ? "驳回重做（说明问题）"
        : GATE_OPTION_LABELS[option];
    const label = `${active ? "❯" : " "} ${i + 1}. ${option}${zh ? ` — ${zh}` : ""}`;
    lines.push({
      text: boxRow(active ? pc.inverse(padW(label, width - 4)) : tint(label), tint, width),
      hit: { type: "gate_option", index: i },
    });
  });
  if (composer.mode === "gate_custom") {
    const hint =
      composer.pendingGateDecision === "reject_and_redo"
        ? "驳回反馈 — 在下方输入框说明问题，Enter 发送"
        : "自定义 — 在下方输入框输入你的意见，Enter 发送";
    lines.push({ text: boxRow(pc.cyan(hint), tint, width) });
  }
  if ((state.snapshot?.openGates.length ?? 0) > 1) {
    lines.push({
      text: boxRow(pc.dim(`还有 ${state.snapshot!.openGates.length - 1} 个确认项排队中`), tint, width),
    });
  }
  lines.push({ text: boxBottom(tint, width) });
  return lines;
}

/**
 * Inline question card. Shows ONLY the current question — answered ones
 * disappear immediately (their answers are already echoed in the stream).
 */
function buildQuestionBox(state: ConsoleState, width: number): HitLine[] {
  const composer = state.composer;
  if (composer.mode !== "question_round" || composer.questions.length === 0) return [];
  const q = composer.questions[composer.questionIndex];
  if (!q) return [];
  const tint = pc.cyan;
  const lines: HitLine[] = [{ text: "" }];

  const answeredCount = composer.draftAnswers.filter((answer) => answer.trim().length > 0).length;
  lines.push({
    text: boxTop(
      `❓ 问题 ${composer.questionIndex + 1}/${composer.questions.length} · 已答 ${answeredCount}/${composer.questions.length}`,
      tint,
      width,
    ),
  });
  for (const text of wrapW(q.question, width - 6, 4)) {
    lines.push({ text: boxRow(pc.bold(text), tint, width) });
  }
  lines.push({ text: boxRow("", tint, width) });
  q.suggestedAnswers.slice(0, 4).forEach((answer, k) => {
    for (const [j, text] of wrapW(answer, width - 12, 2).entries()) {
      lines.push({
        text: boxRow(j === 0 ? ` ${pc.cyan(`${k + 1})`)} ${text}` : `    ${text}`, tint, width),
        hit: { type: "suggestion", index: k },
      });
    }
  });
  lines.push({
    text: boxRow(
      pc.dim(" ← → 切换问题  ·  ✎ 下方输入自定义答案  ·  s 提交本轮"),
      tint,
      width,
    ),
    hit: composer.questionIndex > 0 ? { type: "question_prev" } : undefined,
  });
  lines.push({
    text: boxRow(
      ` ${pc.yellow("跳过并采用默认假设")}`,
      tint,
      width,
    ),
    hit: { type: "skip_clarification" },
  });
  lines.push({ text: boxBottom(tint, width) });
  return lines;
}

/** Big "launch" button shown in the stream when the PRD is ready. */
function buildBigButton(
  width: number,
  launching: boolean,
  rowsIdle: string[],
  rowLaunching: string,
  actionId: string,
): HitLine[] {
  const w = Math.min(width - 4, 58);
  const inner = w - 2;
  const pad = " ".repeat(Math.max(0, Math.floor((width - w) / 2)));
  const center = (s: string): string => {
    const gap = Math.max(0, inner - strWidth(s));
    const left = Math.floor(gap / 2);
    return " ".repeat(left) + s + " ".repeat(gap - left);
  };

  const tint = launching ? pc.cyan : pc.green;
  const rows = launching
    ? [
        `╔${"═".repeat(inner)}╗`,
        `║${center("")}║`,
        `║${center(rowLaunching)}║`,
        `║${center("")}║`,
        `╚${"═".repeat(inner)}╝`,
      ]
    : [
        `╔${"═".repeat(inner)}╗`,
        `║${center("")}║`,
        ...rowsIdle.map((row) => `║${center(row)}║`),
        `║${center("")}║`,
        `╚${"═".repeat(inner)}╝`,
      ];

  const hit: Hit | undefined = launching ? undefined : { type: "action", id: actionId };
  return [
    { text: "" },
    ...rows.map((row) => ({ text: pad + pc.bold(tint(row)), hit })),
  ];
}

function buildLaunchButton(state: ConsoleState, width: number): HitLine[] {
  const status = state.snapshot?.project.status;
  if (state.snapshot?.openGates.length) return [];

  if (status === "PRD Ready") {
    // Once a development agent is actively working, the rocket has left — drop
    // the button. Only count live states: a stale done/failed from an earlier
    // (e.g. failed) attempt must NOT hide the button, the user needs to retry.
    const devActive = [...state.agents.values()].some(
      (agent) =>
        agent.group === "development" &&
        (agent.status === "running" || agent.status === "tool" || agent.status === "blocked"),
    );
    if (devActive) return [];
    const launching = [...state.busy].some((label) => /development|开发/.test(label));
    return buildBigButton(
      width,
      launching,
      ["🚀  ▶▶  启 动 开 发  ◀◀", "PRD 已就绪 — 点击发射 · 快捷键 d"],
      `${spinner()}  点 火 — 架构师 Agent 启动中…`,
      "start_dev",
    );
  }

  if (status === "Testing" && (state.snapshot?.testing?.suiteTotal ?? 0) === 0) {
    const launching = [...state.busy].some((label) => /testing|测试/.test(label));
    return buildBigButton(
      width,
      launching,
      ["🧪  ▶▶  运 行 测 试 + 部 署  ◀◀", "开发完成 — 点击启动验证流水线 · 快捷键 t"],
      `${spinner()}  测 试 流 水 线 启 动 中…`,
      "start_testing",
    );
  }

  return [];
}

const DRAFT_STALE_MS = 12_000;
const DRAFT_MAX_LINES = 6;

/**
 * Growing token-stream draft (agent.stream_delta bypass channel): the text the
 * model is producing right now, refreshed every ~250ms. Replaced by the
 * persisted timeline entry once the generation settles.
 */
function buildLiveDraft(state: ConsoleState, width: number): HitLine[] {
  const draft = state.liveDraft;
  if (!draft) return [];
  if (state.timelineFocusAgentId && draft.agentId !== state.timelineFocusAgentId) return [];
  // A draft that stopped updating is settled or orphaned — stop showing it.
  if (Date.now() - draft.atMs > DRAFT_STALE_MS) return [];
  const inner = Math.max(16, width - 8);
  const wrapped = wrapW(draft.text, inner, 999);
  const tail = wrapped.slice(-DRAFT_MAX_LINES);
  const lines: HitLine[] = [
    { text: "" },
    {
      text: `  ${pc.cyan("✳")} ${pc.bold(pc.cyan(draft.agentName))} ${pc.dim(
        `正在输出 · 已 ${draft.charCount} 字`,
      )}`,
      hit: { type: "select_agent", id: draft.agentId },
    },
  ];
  tail.forEach((line, i) => {
    const caret = i === tail.length - 1 ? pc.cyan("▌") : "";
    lines.push({ text: `    ${pc.dim("┃")} ${pc.dim(line)}${caret}` });
  });
  return lines;
}

/** Live "what is happening right now" footer at the end of the stream. */
function buildLiveLine(state: ConsoleState, width: number): HitLine[] {
  const idleSec = Math.floor((Date.now() - state.lastEventAtMs) / 1000);

  const active = [...state.agents.values()].find(
    (agent) => agent.status === "running" || agent.status === "tool",
  );

  // A live agent beats the request-busy label: streamed progress ("正在撰写…")
  // is far more informative than a static busy spinner.
  if (state.busy.size > 0 && !active) {
    // Strip per-instance suffixes ("gate:<uuid>") down to the action name.
    const label = [...state.busy][0]!.split(":")[0]!;
    // An in-flight request means the server is working (gate resolution keeps
    // the workflow running inside the request) — alarming "无响应/恢复" hints
    // would be wrong here, only show a calm elapsed note.
    const busyNote = idleSec >= 5 ? pc.dim(` · 已运行 ${idleSec}s`) : "";
    return [
      { text: "" },
      { text: `  ${pc.cyan(spinner())} ${pc.cyan(`${label}…`)}${busyNote}` },
    ];
  }
  if (active) {
    if (state.timelineFocusAgentId && active.id !== state.timelineFocusAgentId) return [];
    const lastCall = [...state.toolCalls].reverse().find((tc) => tc.agentId === active.id);
    const doing =
      active.status === "tool" && active.lastTool
        ? `⚙ ${toolVerb(active.lastTool)}${lastCall?.summary ? ` ${lastCall.summary}` : ""}`
        : (active.act ?? active.plan ?? "思考中");
    // Timer must track THIS agent's last event — the global lastEventAtMs
    // resets on unrelated traffic (e.g. Taizi tool calls), faking liveness.
    const agentIdleSec = active.lastSeenAtMs
      ? Math.floor((Date.now() - active.lastSeenAtMs) / 1000)
      : idleSec;
    const activeNote = agentIdleSec >= 5 ? pc.dim(` · 已运行 ${agentIdleSec}s`) : "";
    return [
      { text: "" },
      {
        text: `  ${pc.cyan(spinner())} ${pc.bold(pc.cyan(active.name))} ${pc.dim(clipW(doing, Math.max(10, width - 28)))}${activeNote}`,
        hit: { type: "select_agent", id: active.id },
      },
    ];
  }

  const status = state.snapshot?.project.status;
  // Testing with no suites renders the test+deploy button instead.
  const testButtonShown =
    status === "Testing" && (state.snapshot?.testing?.suiteTotal ?? 0) === 0;
  if (
    status &&
    // PRD Ready renders the launch button instead of an idle note.
    !["Delivered", "Failed", "Paused", "Draft Requirement", "PRD Ready"].includes(status) &&
    !testButtonShown &&
    !state.snapshot?.openGates.length &&
    state.composer.mode !== "question_round"
  ) {
    const stallNote = idleSec >= 5 ? pc.dim(` · 已运行 ${idleSec}s`) : "";
    return [
      { text: "" },
      { text: `  ${pc.dim(`◌ ${status} — 等待工作流推进`)}${stallNote}` },
    ];
  }
  return [];
}

function buildStreamLines(state: ConsoleState, width: number): HitLine[] {
  const focusAgent = state.timelineFocusAgentId
    ? state.agents.get(state.timelineFocusAgentId)
    : undefined;
  const entries = focusAgent
    ? filterTimelineForAgentFocus(state.timeline, focusAgent)
    : state.timeline.filter((entry) => entry.kind !== "prompt");

  const lines: HitLine[] = [];
  if (focusAgent) {
    lines.push(...buildAgentThreadTask(state, width));
  }

  for (const row of buildCodexStream(state, entries, width)) {
    lines.push({
      text: row.text,
      hit: row.hit as Hit | undefined,
    });
  }

  lines.push(...buildLiveDraft(state, width));
  if (!focusAgent) {
    lines.push(...buildGateBox(state, width));
    lines.push(...buildQuestionBox(state, width));
    lines.push(...buildLaunchButton(state, width));
  }
  lines.push(...buildTodoPanel(state, width));
  lines.push(...buildLiveLine(state, width));
  if (lines.length === 0) {
    lines.push({
      text: pc.dim(focusAgent ? `  ${focusAgent.name} 暂无工作记录…` : "  waiting for events…"),
    });
  }
  return lines;
}

function buildTimelineBreadcrumb(state: ConsoleState, width: number): HitLine | undefined {
  const agent = state.timelineFocusAgentId
    ? state.agents.get(state.timelineFocusAgentId)
    : undefined;
  if (!agent) return undefined;
  const back = pc.cyan(pc.underline("信息流"));
  const sep = pc.dim(" › ");
  const current = pc.bold(agent.name);
  return {
    text: padW(`${back}${sep}${current}`, width),
    hit: { type: "timeline_focus_back" },
  };
}

/* ------------------------------------------------------------------ */
/* Input box                                                            */
/* ------------------------------------------------------------------ */

function tailClip(text: string, width: number): string {
  if (strWidth(text) <= width) return text;
  const chars = [...text];
  let out = "";
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const next = chars[i] + out;
    if (strWidth(next) > width - 1) break;
    out = next;
  }
  return `…${out}`;
}

function composerLabel(state: ConsoleState): string {
  const composer = state.composer;
  switch (composer.mode) {
    case "requirement":
      return "describe requirement";
    case "question_round":
      return `Q${composer.questionIndex + 1}/${composer.questions.length} — 1-9 选建议 / ←→ 切换 / s 提交 / k 跳过`;
    case "gate_decision":
      return "门禁决策 — 1-9 / ↑↓ + Enter 选项，或直接输入自然语言";
    case "gate_custom":
      return "custom decision";
    case "deployment_url": {
      const preview =
        state.snapshot?.dev?.previewUrl ?? state.snapshot?.testing?.previewUrl ?? composer.input.trim();
      return preview
        ? `部署 URL 已就绪 — Enter 确认并放行（${preview}）`
        : "输入部署 URL — Enter 确认并放行";
    }
    case "change_request":
      return "太子在线 — 插话 / 变更 / 继续 / 暂停 / 导出…（! 开头立即打断）";
    case "paused":
      return "已暂停 — 输入「继续」恢复";
    default:
      return "太子在线 — 输入任意指令";
  }
}

function buildInputBox(state: ConsoleState, width: number): string[] {
  const composer = state.composer;
  const focused = state.focus === "composer";
  // Taizi 全程接收输入：所有模式都渲染输入行（gate_decision 输入为空时
  // 仍以选项导航为主，但照样显示已输入的自然语言文本）。
  const typing = composer.mode !== "gate_decision" || composer.input.length > 0;
  const tint = focused ? (s: string) => pc.cyan(s) : (s: string) => pc.dim(s);

  const innerW = width - 4;
  let content: string;
  if (typing) {
    const caret = pc.cyan("❯");
    const cursor = focused ? pc.inverse(" ") : "";
    if (composer.input) {
      content = `${caret} ${tailClip(composer.input, innerW - 3)}${cursor}`;
    } else {
      content = `${caret} ${cursor}${pc.dim(` ${clipW(composer.reason, innerW - 4)}`)}`;
    }
  } else if (state.pendingHint) {
    content = `${pc.cyan(spinner())} ${pc.cyan(clipW(composer.reason, innerW - 2))}`;
  } else {
    content = pc.dim(clipW(composer.reason, innerW));
  }

  return [
    boxTop(composerLabel(state), tint, width),
    boxRow(content, tint, width),
    boxBottom(tint, width),
  ];
}

/* ------------------------------------------------------------------ */
/* Right column: project info + artifacts                               */
/* ------------------------------------------------------------------ */

function sectionRule(title: string, width: number): string {
  return padW(pc.dim(`─ ${pc.bold(title)} `.padEnd(width + 9, "─")), width);
}

function kv(label: string, value: string, width: number): string {
  return padW(`${pc.dim(label.padEnd(9))}${clipW(value, width - 10)}`, width);
}

function integrationStatusLabel(status: string): string {
  if (status === "connected") return pc.green("connected");
  if (status === "offline") return pc.yellow("offline");
  if (status === "disabled") return pc.dim("disabled");
  return pc.dim(status);
}

/** Match console phase progress: sliceIndex is 0-based queue position / passed count. */
function formatSliceProgress(sliceIndex: number, sliceTotal: number): string {
  const current = Math.min(sliceIndex + 1, sliceTotal);
  return `${current}/${sliceTotal}`;
}

function formatPanelButton(label: string, cellW: number, enabled: boolean): { plain: string; text: string } {
  const inner = Math.max(strWidth(label) + 2, cellW);
  const bodyInner = inner - 2;
  const gap = Math.max(0, bodyInner - strWidth(label));
  const left = Math.floor(gap / 2);
  const body = `${" ".repeat(left)}${label}${" ".repeat(gap - left)}`;
  const plain = `[${body}]`;
  const tint = enabled ? pc.cyan : pc.dim;
  return { plain, text: tint(plain) };
}

/** Side-by-side deploy + export buttons under the PROJECT metadata block. */
function buildProjectActionButtons(state: ConsoleState, width: number): HitLine[] {
  const ready = isProjectDeployReady(state);
  const deployed = isPreviewDeployed(state);
  const deployBusy = [...state.busy].some((label) => /preview|部署/.test(label));
  const exportBusy = state.busy.has("export submission");

  const deployLabel = deployBusy ? "…" : deployed ? "取消部署" : "部署";
  const exportLabel = exportBusy ? "…" : "导出包";
  const deployActionId = deployed ? "stop_preview" : "start_preview";

  const gap = 2;
  const cellW = Math.max(8, Math.floor((width - gap - 2) / 2));
  const left = formatPanelButton(deployLabel, cellW, ready && !deployBusy);
  const right = formatPanelButton(exportLabel, cellW, ready && !exportBusy);
  const rowText = ` ${left.text}${" ".repeat(gap)}${right.text}`;

  const hits: Array<{ x: number; w: number; hit: Hit }> = [];
  if (ready && !deployBusy) {
    hits.push({
      x: 1,
      w: strWidth(` ${left.plain}`),
      hit: { type: "action", id: deployActionId },
    });
  }
  if (ready && !exportBusy) {
    hits.push({
      x: strWidth(` ${left.plain}${" ".repeat(gap)}`) + 1,
      w: strWidth(right.plain) + 1,
      hit: { type: "action", id: "export_submission" },
    });
  }

  return [{ text: "" }, { text: padW(rowText, width), hits: hits.length ? hits : undefined }];
}

function buildInspectorColumn(
  state: ConsoleState,
  width: number,
  height: number,
): { lines: HitLine[]; filesContent?: { startLine: number; height: number } } {
  const lines: HitLine[] = [];
  const push = (text: string, hit?: Hit): void => {
    lines.push(hit ? { text, hit } : { text });
  };
  const snapshot = state.snapshot;

  push(sectionRule("PROJECT", width));
  if (snapshot) {
    const project = snapshot.project;
    push(kv("name", project.name, width));
    push(kv("id", project.id, width));
    push(kv("status", project.status, width));
    push(kv("phase", snapshot.phase.label, width));
    push(kv("created", project.createdAt.slice(0, 16).replace("T", " "), width));
    if (snapshot.requirement) {
      const score = snapshot.requirement.completenessScore;
      const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);
      push(
        kv("complete", `${pct}%${snapshot.requirement.completenessLocked ? " (locked)" : ""}`, width),
      );
    }
    if (snapshot.dev && snapshot.dev.sliceTotal > 0) {
      push(
        kv(
          "slices",
          `${formatSliceProgress(snapshot.dev.sliceIndex, snapshot.dev.sliceTotal)}${snapshot.dev.currentSliceId ? ` · ${snapshot.dev.currentSliceId}` : ""}`,
          width,
        ),
      );
    }
    if (snapshot.testing && snapshot.testing.suiteTotal > 0) {
      push(kv("tests", `${snapshot.testing.suitePassed}/${snapshot.testing.suiteTotal} passed`, width));
    }
    if (isProjectDeployReady(state)) {
      if (isPreviewDeployed(state)) {
        const preview = snapshot.testing?.previewUrl ?? snapshot.dev?.previewUrl;
        if (preview) push(kv("preview", preview, width));
      } else {
        push(kv("preview", pc.dim("未部署"), width));
      }
    }
    if (snapshot.openGates.length > 0) {
      push(kv("gates", pc.yellow(`${snapshot.openGates.length} open`), width));
    }
  } else {
    push(padW(pc.dim("loading…"), width));
  }

  for (const line of buildProjectActionButtons(state, width)) {
    lines.push(line);
  }

  const integrations = snapshot?.integrations ?? [];
  if (integrations.length > 0) {
    push(" ".repeat(width));
    push(sectionRule("INTEGRATIONS", width));
    for (const item of integrations.slice(0, 5)) {
      push(
        padW(
          `${pc.dim("•")} ${clipW(item.displayName, width - 16)} ${integrationStatusLabel(item.status)}`,
          width,
        ),
      );
    }
    if (integrations.length > 5) {
      push(padW(pc.dim(`  +${integrations.length - 5} more`), width));
    }
  }

  const docs: Array<{ label: string; path: string }> = [];
  const stage = lifecycleIndex(snapshot?.project.status ?? "");
  if (snapshot && (stage >= 1 || snapshot.project.status === "Delivered")) {
    docs.push({ label: "PRD（最新版）", path: `artifacts/${state.projectId}/prd-latest.md` });
    docs.push({ label: "验收标准（最新版）", path: `artifacts/${state.projectId}/ac-latest.md` });
  }
  if (snapshot && stage >= 2) {
    docs.push({ label: "技术方案（最新版）", path: `artifacts/${state.projectId}/tp-latest.md` });
  }
  const seen = new Set(docs.map((d) => d.path));
  for (const artifactPath of state.artifacts) {
    if (!seen.has(artifactPath) && !/\/(prd|ac|tp)-\d+\.md$/.test(artifactPath)) {
      docs.push({ label: artifactPath.split("/").pop() ?? artifactPath, path: artifactPath });
      seen.add(artifactPath);
    }
  }

  const projectLines = lines.length;
  const tabBarLines = 4;
  const contentHeight = Math.max(6, height - projectLines - tabBarLines);

  push(" ".repeat(width));
  push(sectionRule("PANEL", width));
  const artActive = state.inspectorTab === "artifacts";
  const filesActive = state.inspectorTab === "files";
  push(
    padW(artActive ? pc.bold(pc.cyan("▣ Artifacts")) : pc.dim("▢ Artifacts"), width),
    { type: "inspector_tab", tab: "artifacts" },
  );
  push(
    padW(filesActive ? pc.bold(pc.cyan("▣ Files")) : pc.dim("▢ Files"), width),
    { type: "inspector_tab", tab: "files" },
  );

  const contentStart = lines.length;
  if (state.inspectorTab === "artifacts") {
    for (const doc of docs.slice(0, contentHeight)) {
      push(padW(`${pc.green("▤")} ${pc.cyan(clipW(doc.label, width - 3))}`, width), {
        type: "open_artifact",
        path: doc.path,
      });
    }
  } else {
    const treeRows = flattenFileTree(
      buildFileTree(filterRepoPaths(state.repoFiles)),
      state.expandedFileDirs,
    );
    if (treeRows.length === 0) {
      push(padW(pc.dim("（暂无 repo 文件）"), width));
    } else {
      const showTopHint = state.fileTreeScroll > 0;
      const slots = contentHeight - (showTopHint ? 1 : 0);
      const maxScroll = Math.max(0, treeRows.length - slots);
      state.fileTreeScroll = Math.min(state.fileTreeScroll, maxScroll);

      if (showTopHint) {
        push(padW(pc.dim(` ↑ ${state.fileTreeScroll} above — scroll`), width));
      }

      const visibleRows = treeRows.slice(state.fileTreeScroll, state.fileTreeScroll + slots);
      for (const row of visibleRows) {
        const indent = "  ".repeat(row.depth);
        if (row.kind === "dir") {
          const chevron = row.expanded ? pc.cyan("▾") : pc.dim("▸");
          const suffix = row.childCount > 0 ? pc.dim(` (${row.childCount})`) : "";
          push(
            padW(`${indent}${chevron} ${pc.yellow("📁")} ${clipW(row.name, width - indent.length - 8)}${suffix}`, width),
            { type: "toggle_file_dir", path: row.path },
          );
        } else {
          push(
            padW(`${indent}${pc.blue("📄")} ${clipW(row.name, width - indent.length - 4)}`, width),
            { type: "open_file", path: row.path },
          );
        }
      }

      const below = treeRows.length - state.fileTreeScroll - visibleRows.length;
      if (below > 0 && lines.length - contentStart < contentHeight) {
        push(padW(pc.dim(` ↓ ${below} below — scroll`), width));
      }
    }
  }

  while (lines.length - contentStart < contentHeight) {
    push(" ".repeat(width));
  }

  while (lines.length < height) push(" ".repeat(width));
  const filesContent =
    state.inspectorTab === "files"
      ? { startLine: contentStart, height: contentHeight }
      : undefined;
  return { lines: lines.slice(0, height), filesContent };
}

/* ------------------------------------------------------------------ */
/* Markdown rendering — see markdown.ts                                 */
/* ------------------------------------------------------------------ */

export { renderMarkdownLines } from "./markdown.js";

function buildHints(state: ConsoleState, width: number, y: number): string {
  if (state.notice && Date.now() - state.notice.at < 6_000) {
    const tint = state.notice.kind === "error" ? pc.red : pc.green;
    return padW(
      tint(` ${state.notice.kind === "error" ? "✗" : "✓"} ${clipW(state.notice.text, width - 4)}`),
      width,
    );
  }

  const keys =
    state.focus === "timeline"
      ? state.timelineFocusAgentId
        ? "点击 信息流 返回 · wheel/↑↓ scroll · End follow"
        : "wheel/↑↓ scroll · End follow"
      : state.focus === "agents"
        ? "↑↓ select · Enter 查看工作过程"
        : "Enter submit";
  const line = ` ${pc.cyan("Ctrl+P")} 命令  ·  ${pc.dim(keys)}  ·  Tab focus  ·  ^B projects  ·  q quit`;
  return padW(line, width);
}

/* ------------------------------------------------------------------ */
/* Console screen                                                       */
/* ------------------------------------------------------------------ */

const SEP = pc.dim(" │ ");

export function renderConsole(state: ConsoleState): void {
  resetHits();
  const { cols, rows } = termSize();
  const width = cols;

  const header = buildHeader(state, width);
  const bodyTop = header.length;
  const bodyH = Math.max(10, rows - bodyTop - 2);
  const hintsY = bodyTop + bodyH;

  const leftW = Math.max(26, Math.floor(width * 0.2));
  const rightW = Math.max(30, Math.floor(width * 0.24));
  const centerW = width - leftW - rightW - 6;
  const cx = leftW + 3;
  const rx = cx + centerW + 3;

  // General focus zones (registered first → lowest priority).
  addHit(0, bodyTop, leftW, bodyH, { type: "focus", zone: "agents" });
  addHit(rx, bodyTop, rightW, bodyH, { type: "focus", zone: "composer" });

  const streamH = bodyH - 3;
  const breadcrumb = buildTimelineBreadcrumb(state, centerW);
  const crumbRows = breadcrumb ? 1 : 0;
  const streamContentH = streamH - crumbRows;
  streamRect = {
    x1: cx,
    y1: bodyTop + crumbRows,
    x2: cx + centerW - 1,
    y2: bodyTop + streamH - 1,
  };
  addHit(cx, bodyTop + crumbRows, centerW, streamContentH, { type: "focus", zone: "timeline" });
  addHit(cx, bodyTop + streamH, centerW, 3, { type: "focus", zone: "composer" });
  if (breadcrumb) {
    addHit(cx, bodyTop, strWidth("信息流") + 2, 1, { type: "timeline_focus_back" });
  }

  // Left column (with row hits).
  const left = buildAgentsColumn(state, leftW, bodyH);
  left.forEach((line, i) => {
    if (line.hit) addHit(0, bodyTop + i, leftW, 1, line.hit);
  });

  // Center stream with scroll window.
  const streamLines = buildStreamLines(state, centerW);
  const maxScroll = Math.max(0, streamLines.length - streamContentH);
  state.timelineScroll = Math.min(state.timelineScroll, maxScroll);
  const end = streamLines.length - state.timelineScroll;
  const visible = streamLines.slice(Math.max(0, end - streamContentH), end);
  while (visible.length < streamContentH) visible.unshift({ text: "" });
  visible.forEach((line, i) => {
    if (line.hit) addHit(cx, bodyTop + crumbRows + i, centerW, 1, line.hit);
  });
  if (state.timelineScroll > 0) {
    visible[visible.length - 1] = {
      text: pc.yellow(` ▼ ${state.timelineScroll} lines below — End/click to follow `),
      hit: { type: "action", id: "follow_stream" },
    };
    addHit(cx, bodyTop + streamH - 1, centerW, 1, { type: "action", id: "follow_stream" });
  }

  const center = [
    ...(breadcrumb ? [padW(breadcrumb.text, centerW)] : []),
    ...visible.map((line) => padW(line.text, centerW)),
    ...buildInputBox(state, centerW),
  ];

  const inspector = buildInspectorColumn(state, rightW, bodyH);
  const right = inspector.lines;
  if (inspector.filesContent) {
    inspectorFilesRect = {
      x1: rx,
      y1: bodyTop + inspector.filesContent.startLine,
      x2: rx + rightW - 1,
      y2: bodyTop + inspector.filesContent.startLine + inspector.filesContent.height - 1,
    };
    addHit(
      rx,
      bodyTop + inspector.filesContent.startLine,
      rightW,
      inspector.filesContent.height,
      { type: "focus", zone: "composer" },
    );
  }
  right.forEach((line, i) => {
    if (line.hits) {
      for (const span of line.hits) {
        addHit(rx + span.x, bodyTop + i, span.w, 1, span.hit);
      }
    } else if (line.hit) {
      addHit(rx, bodyTop + i, rightW, 1, line.hit);
    }
  });

  const body: string[] = [];
  for (let i = 0; i < bodyH; i += 1) {
    body.push(
      `${padW(left[i]?.text ?? "", leftW)}${SEP}${padW(center[i] ?? "", centerW)}${SEP}${padW(right[i]?.text ?? "", rightW)}`,
    );
  }

  const frame = [...header, ...body, buildHints(state, width, hintsY)];
  if (state.viewer) overlayViewer(frame, state, cols, rows);
  if (state.commandPalette) overlayCommandPalette(frame, state, cols, rows);
  paint(frame);
}

/* ------------------------------------------------------------------ */
/* Command palette overlay (Ctrl+P)                                     */
/* ------------------------------------------------------------------ */

function overlayCommandPalette(
  frame: string[],
  state: ConsoleState,
  cols: number,
  rows: number,
): void {
  const palette = state.commandPalette!;
  const actions = filterPaletteActions(state);
  const cursor = Math.min(palette.cursor, Math.max(0, actions.length - 1));
  palette.cursor = cursor;

  const w = Math.min(cols - 4, 72);
  const visible = 10;
  const listH = Math.min(visible, Math.max(1, actions.length));
  const h = listH + 4;
  const x0 = Math.floor((cols - w) / 2);
  const y0 = Math.max(2, rows - h - 3);

  const place = (y: number, content: string): void => {
    if (y < 0 || y >= frame.length) return;
    frame[y] = padW(content, cols);
  };

  const border = pc.dim("─".repeat(w - 2));
  place(y0, " ".repeat(x0) + pc.dim(`┌${border}┐`));
  place(
    y0 + 1,
    " ".repeat(x0) +
      pc.dim("│ ") +
      pc.cyan("❯ ") +
      palette.query +
      pc.inverse(" ") +
      " ".repeat(Math.max(0, w - 6 - strWidth(palette.query))) +
      pc.dim(" │"),
  );
  place(y0 + 2, " ".repeat(x0) + pc.dim(`├${border}┤`));

  const start = Math.max(0, cursor - Math.floor(visible / 2));
  const window = actions.slice(start, start + visible);
  for (let i = 0; i < listH; i += 1) {
    const action = window[i];
    const rowY = y0 + 3 + i;
    if (!action) {
      place(rowY, " ".repeat(x0) + pc.dim(`│${" ".repeat(w - 2)}│`));
      continue;
    }
    const index = start + i;
    const selected = index === cursor;
    const innerW = w - 4;
    const prefix = selected ? pc.cyan("▸ ") : "  ";
    const label = clipW(action.label, innerW - 2);
    const body = selected ? pc.bgCyan(pc.black(`${prefix}${label}`)) : `${prefix}${label}`;
    addHit(x0 + 2, rowY, w - 4, 1, { type: "palette_action", id: action.id });
    place(
      rowY,
      " ".repeat(x0) + pc.dim("│ ") + padW(body, innerW) + pc.dim(" │"),
    );
  }

  place(y0 + 3 + listH, " ".repeat(x0) + pc.dim(`└${border}┘`));
  place(
    y0 + 3 + listH + 1,
    padW(pc.dim("  ↑↓ select · Enter run · Esc close · type to filter"), cols),
  );
}

/* ------------------------------------------------------------------ */
/* File viewer overlay                                                  */
/* ------------------------------------------------------------------ */

function overlayViewer(frame: string[], state: ConsoleState, cols: number, rows: number): void {
  const viewer = state.viewer!;
  const w = Math.min(cols - 6, 110);
  const h = Math.max(8, rows - 6);
  const x0 = Math.floor((cols - w) / 2);
  const y0 = 2;
  const innerH = h - 2;
  const tint = (s: string) => pc.cyan(s);

  const maxScroll = Math.max(0, viewer.lines.length - innerH);
  viewer.scroll = Math.min(viewer.scroll, maxScroll);
  const slice = viewer.lines.slice(viewer.scroll, viewer.scroll + innerH);

  const place = (y: number, content: string): void => {
    if (y >= frame.length) return;
    frame[y] = " ".repeat(x0) + content;
  };

  const position =
    viewer.lines.length > innerH
      ? ` ${viewer.scroll + 1}-${Math.min(viewer.lines.length, viewer.scroll + innerH)}/${viewer.lines.length} `
      : "";
  place(y0, boxTop(`▤ ${clipW(viewer.title, w - 30)}${position}— Esc 关闭`, tint, w));
  for (let i = 0; i < innerH; i += 1) {
    const raw = viewer.loading && i === 0 ? `${spinner()} loading…` : (slice[i] ?? "");
    place(y0 + 1 + i, boxRow(clipW(raw.replace(/\t/g, "  "), w - 4), tint, w));
  }
  place(y0 + h - 1, boxBottom(tint, w));
}

/* ------------------------------------------------------------------ */
/* Project picker screen                                                */
/* ------------------------------------------------------------------ */

export type PickerState = {
  projects: ProjectRecord[];
  cursor: number;
  mode: "list" | "naming";
  nameInput: string;
  loading: boolean;
  apiOk: boolean;
  error?: string;
};

export function renderPicker(picker: PickerState, apiBase: string): void {
  resetHits();
  const { cols, rows } = termSize();
  const width = cols;
  const lines: string[] = [];

  lines.push("");
  lines.push(padW(`  ${pc.bold(pc.cyan("⬢ OneCompany"))} ${pc.dim("· TUI v2 · project hub")}`, width));
  lines.push(
    padW(
      `  ${pc.dim(apiBase)}  ${picker.apiOk ? pc.green("● connected") : pc.red("○ unreachable")}`,
      width,
    ),
  );
  lines.push(padW(pc.dim("  " + "─".repeat(Math.min(width - 4, 76))), width));

  if (picker.loading) {
    lines.push(padW(pc.dim(`  ${spinner()} loading projects…`), width));
  } else if (picker.error) {
    lines.push(padW(pc.red(`  ✗ ${picker.error}`), width));
  } else if (picker.projects.length === 0) {
    lines.push(padW(pc.dim("  no projects yet — press n to create one"), width));
  } else {
    const visible = rows - lines.length - 6;
    const start = Math.max(
      0,
      Math.min(picker.cursor - Math.floor(visible / 2), picker.projects.length - visible),
    );
    for (const [i, project] of picker.projects.slice(start, start + visible).entries()) {
      const index = start + i;
      const selected = picker.mode === "list" && index === picker.cursor;
      const cursor = selected ? pc.cyan("▸") : " ";
      const name = selected
        ? pc.inverse(` ${clipW(project.name, 38)} `)
        : ` ${clipW(project.name, 38)} `;
      const date = pc.dim(project.updatedAt.slice(0, 16).replace("T", " "));
      addHit(0, lines.length, width, 1, { type: "open_project", id: project.id });
      lines.push(
        padW(`  ${cursor}${padW(name, 42)} ${padW(statusBadge(project.status), 22)} ${date}`, width),
      );
    }
  }

  lines.push("");
  if (picker.mode === "naming") {
    lines.push(padW(pc.dim("  new project name, Enter to create:"), width));
    lines.push(padW(`  ${pc.cyan("❯")} ${picker.nameInput}${pc.inverse(" ")}`, width));
  }

  while (lines.length < rows - 2) lines.push("");

  const footerY = lines.length;
  const segments: Array<[string, string]> = [
    ["n new project", "new_project"],
    ["r refresh", "refresh_projects"],
    ["q quit", "quit"],
  ];
  let x = 2;
  let footer = "  ";
  segments.forEach(([label, id], i) => {
    addHit(x, footerY, strWidth(label), 1, { type: "action", id });
    footer += label;
    x += strWidth(label);
    if (i < segments.length - 1) {
      footer += "  ·  ";
      x += 5;
    }
  });
  lines.push(padW(pc.dim(`${footer}     ↑↓/click select · Enter open`), width));

  paint(lines);
}
