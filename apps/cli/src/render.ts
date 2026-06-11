import pc from "picocolors";
import { groupLabel } from "./agents.js";
import { formatElapsed } from "./projection.js";
import type { AgentPanelState, StreamEntry, ToolCallRecord, TuiViewState } from "./projection.js";
import { clipVisible, padVisible, visibleLength } from "./text-width.js";
import type { CliOptions, ConsoleSnapshot, EventDisplayContext, LogLine, RenderMode } from "./types.js";

export type { RenderMode };

export type RenderState = {
  connected: boolean;
  stubProfilesEnabled?: boolean;
  projectId?: string;
  projectName?: string;
  projectStatus?: string;
  mode: RenderMode;
  gateType?: string;
  gateOptions?: string[];
  prompt?: string;
  logs: LogLine[];
  eventContext: EventDisplayContext;
  snapshot?: ConsoleSnapshot;
  options: CliOptions;
  view: TuiViewState;
  startedAt: number;
};

const COL_SEP = " │ ";

let alternateScreen = false;

export function enterScreen(): void {
  if (!alternateScreen) {
    process.stdout.write("\x1b[?1049h\x1b[?25l");
    alternateScreen = true;
  }
}

export function leaveScreen(): void {
  if (alternateScreen) {
    process.stdout.write("\x1b[?1049l\x1b[?25h");
    alternateScreen = false;
  }
}

function agentGlyph(state: AgentPanelState["state"]): string {
  switch (state) {
    case "RUNNING":
    case "TOOL_CALLING":
      return pc.cyan("●");
    case "DONE":
      return pc.green("●");
    case "FAILED":
      return pc.red("●");
    case "BLOCKED":
      return pc.yellow("●");
    default:
      return pc.dim("○");
  }
}

function streamTint(kind: StreamEntry["kind"], text: string): string {
  switch (kind) {
    case "PHASE_START":
    case "PHASE_DONE":
      return pc.blue(text);
    case "AGENT_START":
      return pc.cyan(text);
    case "REASON":
      return pc.white(text);
    case "TOOL_CALL":
    case "TOOL_RESULT":
      return pc.magenta(text);
    case "VALIDATION":
      return pc.green(text);
    case "ERROR":
      return pc.red(text);
    case "GATE":
      return pc.yellow(text);
    default:
      return pc.dim(text);
  }
}

function validationLabel(status: string): string {
  switch (status) {
    case "PASS":
      return pc.green("PASS");
    case "FAIL":
      return pc.red("FAIL");
    case "RUNNING":
      return pc.cyan("RUN");
    default:
      return pc.dim("PEND");
  }
}

function sectionTitle(title: string, width: number): string[] {
  const rule = pc.dim("─".repeat(Math.max(4, width)));
  return [padVisible(pc.bold(title), width), rule];
}

function compactAgentRow(agent: AgentPanelState, width: number): string {
  const state = agent.state.padEnd(7);
  const name = clipVisible(agent.name, Math.max(8, width - 12));
  return padVisible(`${agentGlyph(agent.state)} ${name} ${pc.dim(state)}`, width);
}

function buildLeftColumn(view: TuiViewState, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  const pushGroup = (label: string, agents: AgentPanelState[]) => {
    if (lines.length >= maxLines) return;
    lines.push(padVisible(pc.dim(label), width));
    for (const agent of agents) {
      if (lines.length >= maxLines) return;
      lines.push(compactAgentRow(agent, width));
      if (agent.lastReason && lines.length < maxLines) {
        lines.push(
          padVisible(pc.dim(`  ↳ ${clipVisible(agent.lastReason, width - 4)}`), width),
        );
      } else if (agent.lastTool && lines.length < maxLines) {
        lines.push(padVisible(pc.dim(`  ⚙ ${clipVisible(agent.lastTool, width - 4)}`), width));
      }
    }
  };

  const req = Object.values(view.agents).filter((a) => a.group === "requirement");
  const dev = Object.values(view.agents).filter((a) => a.group === "development");
  pushGroup(groupLabel("requirement"), req);
  if (lines.length < maxLines) lines.push(padVisible("", width));
  pushGroup(groupLabel("development"), dev);
  return lines.slice(0, maxLines);
}

function buildCenterColumn(view: TuiViewState, width: number, maxLines: number): string[] {
  const lines = sectionTitle("Event Stream", width);
  const budget = maxLines - lines.length - (view.showToolPanel ? 4 : 0);
  const events = view.stream.slice(-Math.max(3, budget));

  if (events.length === 0) {
    lines.push(padVisible(pc.dim("waiting for events…"), width));
  } else {
    for (const entry of events) {
      const tag = streamTint(entry.kind, entry.kind.padEnd(12));
      const agent = entry.agent ? pc.dim(` ${clipVisible(entry.agent, 10)}`) : "";
      const text = clipVisible(entry.text, Math.max(8, width - 30));
      lines.push(padVisible(`${pc.dim(entry.at)} ${tag}${agent} ${text}`, width));
    }
  }

  if (view.showToolPanel && lines.length < maxLines) {
    lines.push(padVisible("", width));
    lines.push(...sectionTitle("Tools", width).slice(0, 2));
    const tools = view.toolCalls.slice(-3);
    if (tools.length === 0) {
      lines.push(padVisible(pc.dim("(none)"), width));
    } else {
      for (const tool of tools) {
        const mark = tool.status === "SUCCESS" ? pc.green("✓") : tool.status === "FAILED" ? pc.red("✗") : pc.cyan("…");
        lines.push(
          padVisible(
            `${mark} ${clipVisible(tool.toolName, width - 8)} ${pc.dim(tool.status)}`,
            width,
          ),
        );
      }
    }
  }

  return lines.slice(0, maxLines);
}

function buildRightColumn(state: RenderState, width: number, maxLines: number): string[] {
  const v = state.view;
  const req = v.requirement;
  const lines: string[] = [];

  lines.push(...sectionTitle("Requirement", width));
  lines.push(padVisible(`App: ${clipVisible(req.appName ?? state.projectName ?? "—", width - 5)}`, width));
  lines.push(padVisible(`Type: ${clipVisible(req.appType ?? "Web App", width - 6)}`, width));
  if (req.completeness !== undefined) {
    const score = req.completeness <= 1 ? Math.round(req.completeness * 100) : Math.round(req.completeness);
    lines.push(padVisible(`Score: ${score}%`, width));
  }
  lines.push(padVisible(pc.dim(clipVisible(req.summary ?? "—", width)), width));

  lines.push(padVisible("", width));
  lines.push(...sectionTitle("Artifacts", width));
  const artifacts = (v.showArtifacts ? v.artifacts : v.artifacts.slice(-4)).slice(-5);
  if (artifacts.length === 0) {
    lines.push(padVisible(pc.dim("(pending)"), width));
  } else {
    for (const path of artifacts) {
      lines.push(padVisible(`${pc.green("✓")} ${clipVisible(path, width - 2)}`, width));
    }
  }

  lines.push(padVisible("", width));
  lines.push(...sectionTitle("Validation", width));
  lines.push(padVisible(`Inst ${validationLabel(v.validation.install)}  Bld ${validationLabel(v.validation.build)}`, width));
  lines.push(padVisible(`Run ${validationLabel(v.validation.start)}  E2E ${validationLabel(v.validation.mainPath)}`, width));

  return lines.slice(0, maxLines);
}

function buildHeader(state: RenderState, width: number): string[] {
  const v = state.view;
  const taskId = state.projectId ? state.projectId.slice(0, 12) : "—";
  const line1 = `oneCompany Generator  Task:${taskId}  ${v.globalStatus}  ${v.progressPct}%  ${formatElapsed(state.startedAt)}`;
  const line2 = `Phase: ${clipVisible(v.phaseLabel ?? "—", 24)}  Agent: ${clipVisible(v.activeAgentName ?? "—", 18)}  ${state.projectStatus ?? "—"}`;
  const line3 = `Input: ${clipVisible(state.options.requirement, width - 7)}`;

  return [
    padVisible(pc.bold(line1), width),
    padVisible(line2, width),
    padVisible(pc.dim(line3), width),
    padVisible(pc.dim("─".repeat(width)), width),
  ];
}

function buildColumnHeader(leftW: number, centerW: number, rightW: number): string {
  return [
    padVisible(pc.dim("Agents"), leftW),
    padVisible(pc.dim("Events / Tools"), centerW),
    padVisible(pc.dim("Snapshot"), rightW),
  ].join(COL_SEP);
}

function mergeColumns(
  left: string[],
  center: string[],
  right: string[],
  leftW: number,
  centerW: number,
  rightW: number,
  height: number,
): string[] {
  const fit = (lines: string[], w: number): string[] => {
    const out = lines.map((line) => padVisible(line, w));
    while (out.length < height) out.push(" ".repeat(w));
    return out.slice(0, height);
  };

  const L = fit(left, leftW);
  const C = fit(center, centerW);
  const R = fit(right, rightW);
  const rows: string[] = [];

  for (let i = 0; i < height; i += 1) {
    rows.push(`${L[i]}${COL_SEP}${C[i]}${COL_SEP}${R[i]}`);
  }
  return rows;
}

function buildBottom(state: RenderState, width: number, maxLines: number): string[] {
  const lines: string[] = [padVisible(pc.dim("─".repeat(width)), width)];

  if (
    state.view.blockedMessage &&
    (state.mode === "gate" || state.mode === "question" || state.view.globalStatus === "BLOCKED")
  ) {
    for (const part of state.view.blockedMessage.split("\n").slice(0, 2)) {
      if (lines.length >= maxLines) break;
      lines.push(padVisible(pc.yellow(clipVisible(part, width)), width));
    }
  }

  if (state.mode === "gate" && state.gateOptions?.length && lines.length < maxLines) {
    lines.push(
      padVisible(
        pc.yellow(
          clipVisible(
            `${state.gateType ?? "gate"}: ${state.gateOptions.map((o, i) => `[${i + 1}]${o}`).join(" ")}`,
            width,
          ),
        ),
        width,
      ),
    );
  }

  const prompt =
    state.mode === "done"
      ? pc.green(state.prompt ?? "Done.")
      : state.mode === "error"
        ? pc.red(state.prompt ?? "Error.")
        : state.prompt
          ? pc.cyan(`› ${state.prompt}`)
          : pc.dim("› waiting…");
  if (lines.length < maxLines) lines.push(padVisible(clipVisible(prompt, width), width));
  if (lines.length < maxLines) {
    lines.push(
      padVisible(
        pc.dim("Enter · s skip · r retry · l tools · a artifacts · q quit"),
        width,
      ),
    );
  }

  while (lines.length < maxLines) lines.push(" ".repeat(width));
  return lines.slice(0, maxLines);
}

export function pushLog(state: RenderState, kind: LogLine["kind"], text: string): void {
  const at = new Date().toLocaleTimeString("en-GB", { hour12: false });
  state.logs.push({ at, kind, text });
  state.view.stream.push({ at, kind: "INFO", text });
  if (state.view.stream.length > 200) {
    state.view.stream.splice(0, state.view.stream.length - 200);
  }
  state.view.lastUpdateAt = at;
}

export function render(state: RenderState): void {
  if (!alternateScreen) enterScreen();

  const termCols = process.stdout.columns || 100;
  const termRows = process.stdout.rows || 40;
  const width = Math.max(80, termCols);

  const headerH = 4;
  const colHeaderH = 1;
  const bottomH = 4;
  const bodyH = Math.max(12, termRows - headerH - colHeaderH - bottomH - 1);

  const sepLen = visibleLength(COL_SEP) * 2;
  const leftW = Math.max(24, Math.floor(width * 0.23));
  const rightW = Math.max(24, Math.floor(width * 0.25));
  const centerW = Math.max(28, width - leftW - rightW - sepLen);

  const leftLines = buildLeftColumn(state.view, leftW, bodyH);
  const centerLines = buildCenterColumn(state.view, centerW, bodyH);
  const rightLines = buildRightColumn(state, rightW, bodyH);

  const frames: string[] = [
    ...buildHeader(state, width),
    buildColumnHeader(leftW, centerW, rightW),
    ...mergeColumns(leftLines, centerLines, rightLines, leftW, centerW, rightW, bodyH),
    ...buildBottom(state, width, bottomH),
  ];

  process.stdout.write("\x1b[H\x1b[2J");
  process.stdout.write(frames.slice(0, termRows - 1).join("\n"));
}

export function appendEnvelopeLogs(state: RenderState, lines: LogLine[]): void {
  for (const line of lines) {
    state.logs.push(line);
  }
}

export function toggleArtifacts(state: RenderState): void {
  state.view.showArtifacts = !state.view.showArtifacts;
}

export function toggleToolPanel(state: RenderState): void {
  state.view.showToolPanel = !state.view.showToolPanel;
}
