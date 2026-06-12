import pc from "picocolors";
import { agentCollapsedIcon, agentCollapsedIconByName, toolVerb } from "./catalog.js";
import {
  buildStreamBlocks,
  formatDuration,
  isTurnExpanded,
  runningTurnLabel,
  turnAgentName,
  turnStats,
  type StreamBlock,
  type Turn,
} from "./codex-turns.js";
import type { ConsoleState, TimelineEntry } from "./store.js";
import { formatAgentTaskPrompt } from "./task-prompt.js";
import { taiziBgLine, taiziPalette } from "./theme.js";
import { clipW, padW, strWidth, wrapPreservingNewlines, wrapW } from "./text.js";
import { renderMarkdownLines } from "./markdown.js";

/* ------------------------------------------------------------------ */
/* Hit lines (mirrors render.ts)                                        */
/* ------------------------------------------------------------------ */

export type CodexHit =
  | { type: "toggle_turn"; id: string; expanded: boolean }
  | { type: "select_agent"; id: string };

export type CodexHitLine = { text: string; hit?: CodexHit };

const REASON_LABEL: Record<string, string> = {
  PLAN: "计划",
  ACT: "执行",
  OBSRV: "观察",
  REFLT: "反思",
};

const REVEAL_CPS = 100;

/** Keep label text at the same column as the default `  ` prefix (2 display cols). */
function activityHeaderPrefix(icon: string | undefined): string {
  if (!icon) return "  ";
  const w = strWidth(icon);
  if (w >= 2) return icon;
  if (w === 1) return ` ${icon}`;
  return "  ";
}

function collapsedHeaderIcon(turn: Turn, state: ConsoleState): string | undefined {
  if (turn.threadId !== "main") {
    const fromThread = agentCollapsedIcon(turn.threadId);
    if (fromThread) return fromThread;
  }
  const name = turnAgentName(turn, state);
  return name ? agentCollapsedIconByName(name) : undefined;
}

function reveal(entry: TimelineEntry, text: string): string {
  if (!entry.bornAtMs) return text;
  const visible = Math.floor(((Date.now() - entry.bornAtMs) / 1000) * REVEAL_CPS);
  const chars = [...text];
  if (visible >= chars.length) return text;
  return `${chars.slice(0, Math.max(0, visible)).join("")}▌`;
}

function toolTitle(entry: TimelineEntry, width: number): string {
  const verb = toolVerb(entry.tool ?? "tool");
  const summary = entry.toolSummary
    ? ` ${clipW(entry.toolSummary, Math.max(8, width - strWidth(verb) - 14))}`
    : "";
  const raw = entry.tool && verb !== entry.tool ? ` ${pc.dim(`(${entry.tool})`)}` : "";
  const repeat = entry.repeat && entry.repeat > 1 ? pc.yellow(` ×${entry.repeat}`) : "";
  return `${pc.bold(verb)}${pc.cyan(summary)}${raw}${repeat}`;
}

function showToolOutput(entry: TimelineEntry, expanded: boolean): boolean {
  if (!expanded) return false;
  if (entry.kind === "tool_err") return true;
  if (entry.kind !== "tool_ok" || !entry.text.trim()) return false;
  const tool = (entry.tool ?? "").toLowerCase();
  if (tool === "bash" || tool === "shell") {
    return /error|fail|not permitted|cannot|denied|exit code: [1-9]/i.test(entry.text);
  }
  return false;
}

function isReadTool(entry: TimelineEntry): boolean {
  const tool = (entry.tool ?? "").toLowerCase();
  return /read|grep|search|glob|list|ls|cat|view/.test(tool);
}

/* ------------------------------------------------------------------ */
/* Primary content (always expanded)                                    */
/* ------------------------------------------------------------------ */

function renderUserBubble(entry: TimelineEntry, width: number): CodexHitLine[] {
  const inner = Math.max(16, width - 6);
  const lines: CodexHitLine[] = [{ text: "" }];
  const wrapped = wrapW(entry.text, inner, 999);
  lines.push({ text: `  ${pc.cyan("┌")} ${pc.bold(pc.cyan("用户"))}` });
  for (const row of wrapped) {
    lines.push({ text: `  ${pc.cyan("│")} ${pc.bold(row)}` });
  }
  lines.push({ text: `  ${pc.cyan("└")}${"─".repeat(Math.min(inner + 2, width - 4))}` });
  return lines;
}

function renderTaiziReply(
  entry: TimelineEntry,
  width: number,
  theme: ConsoleState["theme"],
): CodexHitLine[] {
  const palette = taiziPalette(theme);
  const out: CodexHitLine[] = [{ text: "" }];
  const prefix = `${palette.accent}◆${palette.fg} ${pc.bold("太子")} `;
  const prefixPad = "   ";
  const mdWidth = Math.max(16, width - strWidth(prefixPad));
  const rendered = renderMarkdownLines(entry.text, mdWidth);
  let headerPlaced = false;
  for (const line of rendered) {
    if (!headerPlaced && line.trim()) {
      out.push({ text: taiziBgLine(`${prefix}${line}`, width, theme) });
      headerPlaced = true;
    } else {
      out.push({ text: taiziBgLine(`${prefixPad}${line}`, width, theme) });
    }
  }
  if (!headerPlaced) {
    out.push({ text: taiziBgLine(`${prefix}${pc.dim("（无内容）")}`, width, theme) });
  }
  if (entry.metaAction) {
    out.push({ text: taiziBgLine(`${prefixPad}${pc.dim(`(${entry.metaAction})`)}`, width, theme) });
  }
  return out;
}

function renderConclusion(entry: TimelineEntry, width: number): CodexHitLine[] {
  const out: CodexHitLine[] = [{ text: "" }, { text: `  ${pc.bold("主要发现")}` }];
  const mdWidth = Math.max(16, width - 4);
  for (const line of renderMarkdownLines(reveal(entry, entry.text), mdWidth)) {
    out.push({ text: `  ${line}` });
  }
  return out;
}

function renderPrimaryEntry(
  entry: TimelineEntry,
  width: number,
  theme: ConsoleState["theme"],
): CodexHitLine[] {
  if (entry.kind === "taizi") return renderTaiziReply(entry, width, theme);
  if (entry.kind === "reason" && entry.tag === "REFLT") return renderConclusion(entry, width);
  return renderStandaloneEntry(entry, width);
}

function renderStandaloneEntry(entry: TimelineEntry, width: number): CodexHitLine[] {
  const out: CodexHitLine[] = [{ text: "" }];
  const time = pc.dim(entry.at);
  switch (entry.kind) {
    case "status":
      out.push({ text: `${pc.blue("◆")} ${pc.bold(pc.blue(entry.text))} ${time}` });
      break;
    case "gate":
      out.push({ text: `${pc.yellow("⛔")} ${pc.bold(pc.yellow(entry.text))} ${time}` });
      break;
    case "gate_ok":
      out.push({ text: `${pc.yellow("✓")} ${pc.yellow(entry.text)}` });
      break;
    case "error": {
      const wrapped = wrapW(entry.text, width - 4, 6);
      out.push({ text: `${pc.red("✗")} ${pc.red(pc.bold(wrapped[0] ?? ""))}` });
      for (const cont of wrapped.slice(1)) out.push({ text: `  ${pc.red(cont)}` });
      break;
    }
    default:
      out.push({ text: `  ${pc.dim(`· ${entry.text}`)}` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Activity group (collapsible execution trace)                         */
/* ------------------------------------------------------------------ */

function activitySummaryLine(turn: Turn, stats: ReturnType<typeof turnStats>): string {
  const parts: string[] = [];
  if (stats.toolCalls > 0) parts.push(`${stats.toolCalls} 次工具调用`);
  if (stats.filesModified > 0) parts.push(`修改 ${stats.filesModified} 个文件`);
  if (stats.testsPassed > 0) parts.push(`${stats.testsPassed} 项测试通过`);
  if (stats.testsFailed > 0) parts.push(`${stats.testsFailed} 项测试失败`);
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}

function renderActivityHeader(
  turn: Turn,
  state: ConsoleState,
  width: number,
  expanded: boolean,
): CodexHitLine {
  const stats = turnStats(turn);
  const duration = formatDuration(stats.durationMs);
  const chevron = expanded ? pc.dim("﹀") : pc.dim("〉");
  const summary = activitySummaryLine(turn, stats);
  const agent = turnAgentName(turn, state);
  const agentLabel = agent ? `${pc.bold(agent)} ` : "";

  let label: string;
  if (turn.status === "running") {
    const doing = runningTurnLabel(turn, state);
    const action =
      doing && agent && doing.startsWith(agent)
        ? doing.slice(agent.length).trim()
        : doing;
    label = agent
      ? action
        ? `${pc.cyan("◉")} ${agentLabel}${pc.dim(clipW(action, width - strWidth(agent) - 16))}`
        : `${pc.cyan("◉")} ${agentLabel}${pc.dim("处理中…")}`
      : doing
        ? `${pc.cyan("◉")} ${pc.bold(pc.cyan(clipW(doing, width - 20)))}`
        : `${pc.cyan("◉")} ${pc.dim("处理中…")}`;
  } else if (turn.status === "failed") {
    label = agent
      ? `${agentLabel}${pc.red("执行失败")} ${pc.dim(duration)}`
      : `${pc.red("执行失败")} ${pc.dim(duration)}`;
  } else {
    label = agent
      ? `${agentLabel}${pc.dim("已处理")} ${pc.dim(duration)}${pc.dim(summary)}`
      : `${pc.dim("已处理")} ${pc.dim(duration)}${pc.dim(summary)}`;
  }

  const collapsedIcon =
    !expanded && agent && turn.status !== "running"
      ? (() => {
          const glyph = collapsedHeaderIcon(turn, state);
          return glyph ? pc.dim(glyph) : undefined;
        })()
      : undefined;

  return {
    text: padW(`${activityHeaderPrefix(collapsedIcon)}${label} ${chevron}`, width),
    hit: { type: "toggle_turn", id: turn.id, expanded },
  };
}

function renderActivityEntry(
  entry: TimelineEntry,
  width: number,
  expanded: boolean,
  isLast: boolean,
): CodexHitLine[] {
  if (entry.bornAtMs && entry.bornAtMs > Date.now()) return [];

  const out: CodexHitLine[] = [];
  const indent = "    ";

  switch (entry.kind) {
    case "agent":
      out.push({
        text: `${indent}${pc.cyan("⏺")} ${pc.bold(pc.cyan(entry.agent ?? entry.text))} ${pc.dim("开始工作")}`,
      });
      break;
    case "reason": {
      const label = REASON_LABEL[entry.tag] ?? "思考";
      const inner = width - 12;
      if (expanded) {
        const rows = wrapPreservingNewlines(reveal(entry, entry.text), inner);
        out.push({ text: `${indent}${pc.cyan(label)}  ${rows[0] ?? ""}` });
        for (const cont of rows.slice(1)) out.push({ text: `${indent}      ${cont}` });
      } else {
        const maxLines = isLast ? 4 : 1;
        const wrapped = wrapW(reveal(entry, entry.text), inner, maxLines);
        out.push({ text: `${indent}${pc.cyan(label)}  ${wrapped[0] ?? ""}` });
        for (const cont of wrapped.slice(1)) out.push({ text: `${indent}      ${cont}` });
      }
      break;
    }
    case "tool":
      out.push({ text: `${indent}${pc.magenta("◉")} ${toolTitle(entry, width)} ${pc.dim("…")}` });
      break;
    case "tool_ok": {
      if (isReadTool(entry) && !expanded) {
        out.push({ text: `${indent}${pc.green("✓")} ${toolTitle(entry, width)}` });
        break;
      }
      out.push({ text: `${indent}${pc.green("✓")} ${toolTitle(entry, width)}` });
      if (showToolOutput(entry, expanded)) {
        const maxLines = isLast ? 8 : 2;
        for (const cont of wrapW(entry.text, width - 10, maxLines)) {
          out.push({ text: `${indent}  ${pc.dim(`⎿ ${cont}`)}` });
        }
      }
      break;
    }
    case "tool_redirect":
      out.push({
        text: `${indent}${pc.yellow("↪")} ${toolTitle(entry, width)} ${pc.dim("→ 受治理执行")}`,
      });
      break;
    case "tool_err": {
      out.push({ text: `${indent}${pc.red("✗")} ${toolTitle(entry, width)}` });
      const maxLines = expanded || isLast ? 8 : 3;
      for (const cont of wrapW(entry.text, width - 10, maxLines)) {
        out.push({ text: `${indent}  ${pc.red(`⎿ ${cont}`)}` });
      }
      break;
    }
    case "test": {
      const passed = /passed/.test(entry.text);
      const mark = passed ? pc.green("✓") : pc.red("✗");
      out.push({ text: `${indent}${mark} ${(passed ? pc.green : pc.red)(entry.text)}` });
      break;
    }
    case "artifact":
      out.push({ text: `${indent}${pc.green("+")} ${pc.dim(entry.text)}` });
      break;
    case "deploy":
      out.push({ text: `${indent}${pc.blue("↗")} ${pc.blue(entry.text)}` });
      break;
    case "error": {
      const wrapped = wrapW(entry.text, width - 8, expanded ? 6 : 3);
      out.push({ text: `${indent}${pc.red("✗")} ${pc.red(wrapped[0] ?? "")}` });
      for (const cont of wrapped.slice(1)) out.push({ text: `${indent}  ${pc.red(cont)}` });
      break;
    }
    case "prompt": {
      const inner = Math.max(16, width - 8);
      out.push({ text: `${indent}${pc.magenta("▤")} ${pc.dim("开工 Prompt")}` });
      if (expanded) {
        for (const row of wrapPreservingNewlines(entry.text, inner)) {
          out.push({ text: `${indent}  ${pc.dim(row)}` });
        }
      }
      break;
    }
    default:
      if (entry.text.trim()) {
        out.push({ text: `${indent}${pc.dim(`· ${clipW(entry.text, width - 10)}`)}` });
      }
  }
  return out;
}

function renderActivityGroup(turn: Turn, state: ConsoleState, width: number): CodexHitLine[] {
  if (turn.activities.length === 0) return [];

  const expanded = isTurnExpanded(turn, state);
  const agentName = turnAgentName(turn, state);
  const lines: CodexHitLine[] = [];
  lines.push(renderActivityHeader(turn, state, width, expanded));

  if (!expanded) return lines;

  const activities = turn.activities;
  for (let i = 0; i < activities.length; i += 1) {
    const entry = activities[i]!;
    if (entry.kind === "agent" && agentName) continue;
    const isLast = i === activities.length - 1;
    lines.push(...renderActivityEntry(entry, width, expanded, isLast));
  }
  return lines;
}

function renderTurnBlock(turn: Turn, state: ConsoleState, width: number): CodexHitLine[] {
  const lines: CodexHitLine[] = [];
  lines.push(...renderActivityGroup(turn, state, width));
  for (const entry of turn.primaryEntries) {
    lines.push(...renderPrimaryEntry(entry, width, state.theme));
  }
  return lines;
}

function renderBlock(block: StreamBlock, state: ConsoleState, width: number): CodexHitLine[] {
  switch (block.type) {
    case "user":
      return renderUserBubble(block.entry, width);
    case "turn":
      return renderTurnBlock(block.turn, state, width);
    case "standalone":
      return renderStandaloneEntry(block.entry, width);
  }
}

function patchRunningTurn(blocks: StreamBlock[], state: ConsoleState): void {
  const last = blocks.at(-1);
  if (last?.type !== "turn") return;
  const turn = last.turn;
  if (turn.primaryEntries.length > 0) return;
  const active = [...state.agents.values()].find(
    (a) => a.status === "running" || a.status === "tool",
  );
  if (!active) return;
  if (turn.threadId === "main" || turn.threadId === active.id) {
    turn.status = "running";
  }
}

/** Codex-style conversation stream: primary content expanded, execution grouped. */
export function buildCodexStream(
  state: ConsoleState,
  entries: TimelineEntry[],
  width: number,
): CodexHitLine[] {
  const blocks = buildStreamBlocks(entries);
  patchRunningTurn(blocks, state);
  const lines: CodexHitLine[] = [];
  for (const block of blocks) {
    lines.push(...renderBlock(block, state, width));
  }
  return lines;
}

function agentTaskPromptText(prompt: TimelineEntry): string {
  return formatAgentTaskPrompt(prompt.text);
}

/** Agent-focus thread header task summary. */
export function buildAgentThreadTask(state: ConsoleState, width: number): CodexHitLine[] {
  const agentId = state.timelineFocusAgentId;
  if (!agentId) return [];
  const agent = state.agents.get(agentId);
  if (!agent) return [];

  const prompt = [...state.timeline]
    .reverse()
    .find((e) => e.kind === "prompt" && e.agent === agent.name);
  if (!prompt) return [];

  const inner = Math.max(16, width - 4);
  const lines: CodexHitLine[] = [
    { text: "" },
    { text: `  ${pc.bold("任务")}` },
  ];
  for (const row of wrapPreservingNewlines(agentTaskPromptText(prompt), inner)) {
    const styled =
      row.startsWith("── ") && row.endsWith(" ──")
        ? pc.bold(pc.cyan(row))
        : row.startsWith("场景:")
          ? pc.bold(row)
          : row;
    lines.push({ text: `  ${styled}` });
  }
  return lines;
}