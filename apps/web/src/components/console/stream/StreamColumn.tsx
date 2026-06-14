"use client";

import type { ConsoleState, TimelineEntry } from "../../../store/types";
import type { ConsoleActions } from "../../../hooks/useConsoleState";
import {
  buildStreamBlocks,
  formatDuration,
  isTurnExpanded,
  runningTurnLabel,
  turnAgentName,
  turnStats,
  type StreamBlock,
  type Turn,
} from "../../../store/stream-blocks";
import {
  agentCollapsedIconByName,
  normalizeAgentId,
} from "../../../lib/catalog/agents";
import { toolInProgressSuffix, toolVerb } from "../../../lib/catalog/tools";
import { GATE_OPTION_LABELS, gateDefinition } from "../../../lib/catalog/gates";
import { REVEAL_CPS } from "../../../store/reducer";
import { Box, Rule, StatusBadge, Spinner } from "../../ui/primitives";
import { taiziPalette } from "../../../lib/theme/palette";
import { renderMarkdown } from "../../../lib/format/markdown";
import { wrapPreservingNewlines } from "../../../lib/format/text";

const REASON_LABEL: Record<string, string> = {
  PLAN: "计划",
  ACT: "执行",
  OBSRV: "观察",
  REFLT: "反思",
};

function reveal(entry: TimelineEntry, text: string): string {
  if (!entry.bornAtMs) return text;
  const visible = Math.floor(((Date.now() - entry.bornAtMs) / 1000) * REVEAL_CPS);
  const chars = [...text];
  if (visible >= chars.length) return text;
  return `${chars.slice(0, Math.max(0, visible)).join("")}▌`;
}

function toolTitle(entry: TimelineEntry): React.ReactNode {
  const verb = toolVerb(entry.tool ?? "tool");
  return (
    <span>
      <span className="font-bold">{verb}</span>
      {entry.toolSummary && <span className="text-term-cyan"> {entry.toolSummary}</span>}
      {entry.tool && verb !== entry.tool && <span className="text-term-dim"> ({entry.tool})</span>}
      {entry.repeat && entry.repeat > 1 && (
        <span className="text-term-yellow"> ×{entry.repeat}</span>
      )}
    </span>
  );
}

function isReadTool(entry: TimelineEntry): boolean {
  const tool = (entry.tool ?? "").toLowerCase();
  return /read|grep|search|glob|list|ls|cat|view/.test(tool);
}

function UserBubble({ entry }: { entry: TimelineEntry }) {
  return (
    <div className="my-2">
      <div className="text-term-cyan">
        ┌ <span className="font-bold text-term-cyan">用户</span>
      </div>
      <div className="pl-3 border-l-2 border-term-cyan/50 font-bold whitespace-pre-wrap break-words">
        {entry.text}
      </div>
      <div className="text-term-cyan">└────</div>
    </div>
  );
}

function TaiziReply({
  entry,
  theme,
}: {
  entry: TimelineEntry;
  theme: ConsoleState["theme"];
}) {
  const palette = taiziPalette(theme);
  return (
    <div className="my-2 rounded-sm overflow-hidden" style={{ background: palette.bg }}>
      <div className="px-3 py-2" style={{ color: palette.fg }}>
        <div className="font-bold" style={{ color: palette.accent }}>
          ◆ 太子
        </div>
        <div className="mt-1 whitespace-pre-wrap">{renderMarkdown(entry.text, 80)}</div>
        {entry.metaAction && (
          <div className="text-xs opacity-60 mt-1">({entry.metaAction})</div>
        )}
      </div>
    </div>
  );
}

function Conclusion({ entry }: { entry: TimelineEntry }) {
  return (
    <div className="my-2 pl-2">
      <div className="font-bold">主要发现</div>
      <div className="whitespace-pre-wrap">{renderMarkdown(reveal(entry, entry.text), 80)}</div>
    </div>
  );
}

function ActivityEntry({
  entry,
  expanded,
  isLast,
}: {
  entry: TimelineEntry;
  expanded: boolean;
  isLast: boolean;
}) {
  if (entry.bornAtMs && entry.bornAtMs > Date.now()) return null;
  const indent = "pl-4";

  switch (entry.kind) {
    case "agent":
      return (
        <div className={indent}>
          <span className="text-term-cyan">⏺</span>{" "}
          <span className="font-bold text-term-cyan">{entry.agent ?? entry.text}</span>{" "}
          <span className="text-term-dim">开始工作</span>
        </div>
      );
    case "reason": {
      const label = REASON_LABEL[entry.tag] ?? "思考";
      const text = reveal(entry, entry.text);
      return (
        <div className={indent}>
          <span className="text-term-cyan">{label}</span> <span className="whitespace-pre-wrap">{text}</span>
        </div>
      );
    }
    case "tool":
      return (
        <div className={indent}>
          <span className="text-term-magenta">◉</span> {toolTitle(entry)}{" "}
          <span className="text-term-dim">{toolInProgressSuffix(entry.tool)}</span>
        </div>
      );
    case "tool_ok":
      return (
        <div className={indent}>
          <span className="text-term-green">✓</span> {toolTitle(entry)}
          {expanded &&
            /error|fail|not permitted|cannot|denied|exit code: [1-9]/i.test(entry.text) &&
            (entry.tool === "bash" || entry.tool === "shell") && (
              <div className="pl-2 text-term-dim whitespace-pre-wrap">⎿ {entry.text}</div>
            )}
        </div>
      );
    case "tool_redirect":
      return (
        <div className={indent}>
          <span className="text-term-yellow">↪</span> {toolTitle(entry)}{" "}
          <span className="text-term-dim">→ 受治理执行</span>
        </div>
      );
    case "tool_err":
      return (
        <div className={indent}>
          <span className="text-term-red">✗</span> {toolTitle(entry)}
          <div className="pl-2 text-term-red whitespace-pre-wrap">⎿ {entry.text}</div>
        </div>
      );
    case "test": {
      const passed = /passed/.test(entry.text);
      return (
        <div className={indent}>
          <span className={passed ? "text-term-green" : "text-term-red"}>
            {passed ? "✓" : "✗"}
          </span>{" "}
          <span className={passed ? "text-term-green" : "text-term-red"}>{entry.text}</span>
        </div>
      );
    }
    case "artifact":
      return (
        <div className={`${indent} text-term-dim`}>
          + {entry.text}
        </div>
      );
    case "deploy":
      return (
        <div className={`${indent} text-term-blue`}>↗ {entry.text}</div>
      );
    case "error":
      return (
        <div className={`${indent} text-term-red whitespace-pre-wrap`}>
          ✗ {entry.text}
        </div>
      );
    case "prompt":
      return (
        <div className={indent}>
          <span className="text-term-magenta">▤</span> <span className="text-term-dim">开工 Prompt</span>
          {expanded && (
            <div className="pl-2 text-term-dim whitespace-pre-wrap">{entry.text}</div>
          )}
        </div>
      );
    default:
      return entry.text.trim() ? <div className={`${indent} text-term-dim`}>· {entry.text}</div> : null;
  }
}

function ActivityGroup({
  turn,
  state,
  onToggle,
}: {
  turn: Turn;
  state: ConsoleState;
  onToggle: () => void;
}) {
  if (turn.activities.length === 0) return null;
  const expanded = isTurnExpanded(turn, state);
  const stats = turnStats(turn);
  const duration = formatDuration(stats.durationMs);
  const agent = turnAgentName(turn, state);
  const icon = agent ? agentCollapsedIconByName(agent) : undefined;

  const summaryParts: string[] = [];
  if (stats.toolCalls > 0) summaryParts.push(`${stats.toolCalls} 次工具调用`);
  if (stats.filesModified > 0) summaryParts.push(`修改 ${stats.filesModified} 个文件`);
  if (stats.testsPassed > 0) summaryParts.push(`${stats.testsPassed} 项测试通过`);
  if (stats.testsFailed > 0) summaryParts.push(`${stats.testsFailed} 项测试失败`);
  const summary = summaryParts.length ? ` · ${summaryParts.join(" · ")}` : "";

  return (
    <div className="my-1">
      <button onClick={onToggle} className="w-full text-left text-xs hover:bg-term-cyan/5 px-1 py-0.5">
        <span className="text-term-dim">{icon ? `${icon} ` : "  "}</span>
        {turn.status === "running" ? (
          <span className="text-term-cyan">
            ◉{" "}
            {agent && <span className="font-bold">{agent} </span>}
            <span className="text-term-dim">{runningTurnLabel(turn, state) ?? "处理中…"}</span>
          </span>
        ) : turn.status === "failed" ? (
          <span>
            {agent && <span className="font-bold">{agent} </span>}
            <span className="text-term-red">执行失败</span> <span className="text-term-dim">{duration}</span>
          </span>
        ) : (
          <span>
            {agent && <span className="font-bold">{agent} </span>}
            <span className="text-term-dim">
              已处理 {duration}
              {summary}
            </span>
          </span>
        )}{" "}
        <span className="text-term-dim">{expanded ? "﹀" : "〉"}</span>
      </button>
      {expanded && (
        <div className="space-y-0.5 mt-0.5">
          {turn.activities.map((entry, i) => {
            if (entry.kind === "agent" && agent) return null;
            return (
              <ActivityEntry
                key={i}
                entry={entry}
                expanded={expanded}
                isLast={i === turn.activities.length - 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function StandaloneEntry({ entry }: { entry: TimelineEntry }) {
  switch (entry.kind) {
    case "status":
      return (
        <div className="my-1">
          <span className="text-term-blue">◆</span>{" "}
          <span className="font-bold text-term-blue">{entry.text}</span>{" "}
          <span className="text-term-dim">{entry.at}</span>
        </div>
      );
    case "gate":
      return (
        <div className="my-1">
          <span className="text-term-yellow">⛔</span>{" "}
          <span className="font-bold text-term-yellow">{entry.text}</span>{" "}
          <span className="text-term-dim">{entry.at}</span>
        </div>
      );
    case "gate_ok":
      return (
        <div className="my-1">
          <span className="text-term-yellow">✓</span>{" "}
          <span className="text-term-yellow">{entry.text}</span>
        </div>
      );
    case "error":
      return (
        <div className="my-1 text-term-red">
          ✗ <span className="font-bold">{entry.text}</span>
        </div>
      );
    default:
      return (
        <div className="my-1 text-term-dim">· {entry.text}</div>
      );
  }
}

function Block({
  block,
  state,
  onToggleTurn,
}: {
  block: StreamBlock;
  state: ConsoleState;
  onToggleTurn: (turn: Turn) => void;
}) {
  switch (block.type) {
    case "user":
      return <UserBubble entry={block.entry} />;
    case "turn":
      return (
        <>
          <ActivityGroup turn={block.turn} state={state} onToggle={() => onToggleTurn(block.turn)} />
          {block.turn.primaryEntries.map((entry, i) => {
            if (entry.kind === "taizi") return <TaiziReply key={i} entry={entry} theme={state.theme} />;
            if (entry.kind === "reason" && entry.tag === "REFLT")
              return <Conclusion key={i} entry={entry} />;
            return <StandaloneEntry key={i} entry={entry} />;
          })}
        </>
      );
    case "standalone":
      return <StandaloneEntry entry={block.entry} />;
  }
}

function GateBox({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const gate = state.snapshot?.openGates[0];
  if (!gate) return null;
  const def = gateDefinition(gate.gateType);
  const remaining = (state.snapshot?.openGates.length ?? 1) - 1;
  const yoloAuto = state.yoloMode && gate.gateType === "dangerous_operation";

  const pick = (decision: string) => {
    if (decision === "custom" || decision === "reject_and_redo") {
      state.composer.mode = "gate_custom";
      state.composer.pendingGateDecision = decision;
    } else {
      void actions.resolveGate(gate.id, decision);
    }
  };

  return (
    <Box title={`⛔ ${def.title}`} tint="text-term-yellow" border="border-term-yellow/40" className="my-2">
      <div className="text-term-dim text-xs">{def.description}</div>
      {yoloAuto && <div className="text-term-yellow text-xs">⚡ YOLO 已开启 — 将自动放行</div>}
      <div className="mt-2 space-y-1">
        {def.options.map((opt, i) => (
          <button
            key={opt}
            onClick={() => pick(opt)}
            className="block w-full text-left text-xs px-2 py-0.5 hover:bg-term-yellow/10"
          >
            <span className="text-term-yellow">{i + 1}.</span>{" "}
            <span className="text-term-fg">{GATE_OPTION_LABELS[opt] ?? opt}</span>{" "}
            <span className="text-term-dim">({opt})</span>
          </button>
        ))}
      </div>
      {remaining > 0 && <div className="text-xs text-term-dim mt-1">还有 {remaining} 个确认项排队中</div>}
    </Box>
  );
}

function QuestionBox({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const composer = state.composer;
  if (composer.mode !== "question_round" || composer.questions.length === 0) return null;
  const idx = composer.questionIndex;
  const question = composer.questions[idx];
  if (!question) return null;

  return (
    <Box
      title={`❓ 问题 ${idx + 1}/${composer.questions.length} · 已答 ${composer.draftAnswers.filter((a) => a.trim()).length}/${composer.questions.length}`}
      tint="text-term-cyan"
      border="border-term-cyan/40"
      className="my-2"
    >
      <div className="font-bold whitespace-pre-wrap">{question.question}</div>
      {question.suggestedAnswers.length > 0 && (
        <div className="mt-2 space-y-1">
          {question.suggestedAnswers.slice(0, 4).map((s, i) => (
            <button
              key={i}
              onClick={() => {
                composer.draftAnswers[idx] = s;
                if (idx < composer.questions.length - 1) composer.questionIndex = idx + 1;
                else void actions.submitAnswers(composer.draftAnswers);
              }}
              className="block w-full text-left text-xs px-2 py-0.5 hover:bg-term-cyan/10"
            >
              <span className="text-term-cyan">{i + 1})</span> {s}
            </button>
          ))}
        </div>
      )}
      <div className="text-xs text-term-dim mt-2">← → 切换问题 · ✎ 下方输入自定义答案 · s 提交</div>
      <button
        onClick={() => void actions.skipClarification()}
        className="block w-full text-left text-xs text-term-yellow mt-1 hover:bg-term-yellow/10"
      >
        跳过并采用默认假设
      </button>
    </Box>
  );
}

function LiveLine({ state }: { state: ConsoleState }) {
  const activeAgent = [...state.agents.values()].find(
    (a) => a.status === "running" || a.status === "tool",
  );
  if (!activeAgent) {
    return (
      <div className="text-xs text-term-dim px-2 py-1">
        ◌ {state.snapshot?.project.status ?? "idle"} — 等待工作流推进
      </div>
    );
  }
  const sec = activeAgent.activeSinceMs
    ? Math.floor((Date.now() - activeAgent.activeSinceMs) / 1000)
    : 0;
  const action = activeAgent.lastTool
    ? `⚙ ${activeAgent.lastTool}`
    : activeAgent.act ?? "思考中";
  return (
    <div className="text-xs text-term-dim px-2 py-1 flex items-center gap-1">
      <Spinner className="text-term-cyan" />
      <span className="text-term-cyan">{activeAgent.name}</span>
      <span>{action}</span>
      <span>· 已运行 {sec}s</span>
    </div>
  );
}

function LiveDraftBlock({ state }: { state: ConsoleState }) {
  const draft = state.liveDraft;
  if (!draft) return null;
  // Hide stale drafts (no update for >3s).
  if (Date.now() - draft.atMs > 3_000) return null;
  return (
    <div className="my-1 px-2 text-xs text-term-dim">
      <span className="text-term-magenta">✳ {draft.agentName} 正在输出</span> · 已 {draft.charCount} 字
      <div className="pl-2 mt-0.5 whitespace-pre-wrap text-term-fg">
        {draft.text}
        <span className="text-term-cyan">▌</span>
      </div>
    </div>
  );
}

function LaunchButton({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const status = state.snapshot?.project.status;
  if (status === "PRD Ready") {
    return (
      <button
        onClick={() => void actions.dispatchAction("start_dev")}
        className="w-full my-2 py-2 border-2 border-term-green text-term-green font-bold hover:bg-term-green/10"
      >
        🚀 ▶▶ 启 动 开 发 ◀◀
      </button>
    );
  }
  if (status === "Testing" && (state.snapshot?.testing?.suiteTotal ?? 0) === 0) {
    return (
      <button
        onClick={() => void actions.dispatchAction("start_testing")}
        className="w-full my-2 py-2 border-2 border-term-blue text-term-blue font-bold hover:bg-term-blue/10"
      >
        🧪 ▶▶ 运 行 测 试 + 部 署 ◀◀
      </button>
    );
  }
  return null;
}

function TodoPanel({ state }: { state: ConsoleState }) {
  if (state.todos.length === 0) return null;
  return (
    <div className="my-2 px-2">
      <div className="text-xs font-bold text-term-cyan">📋 任务清单</div>
      <div className="mt-1 space-y-0.5">
        {state.todos.map((todo, i) => {
          const icon =
            todo.status === "completed"
              ? "☑"
              : todo.status === "in_progress"
                ? "◔"
                : todo.status === "cancelled"
                  ? "☒"
                  : "☐";
          const priority = todo.priority === "high" ? "!" : "·";
          return (
            <div
              key={i}
              className={`text-xs ${
                todo.status === "completed" || todo.status === "cancelled" ? "line-through text-term-dim" : ""
              }`}
            >
              {icon} {priority} {todo.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StreamColumn({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const toggleTurn = (turn: Turn) => {
    const expanded = isTurnExpanded(turn, state);
    if (expanded) {
      state.collapsedTurns.add(turn.id);
      state.pinnedTurns.delete(turn.id);
    } else {
      state.collapsedTurns.delete(turn.id);
      state.pinnedTurns.add(turn.id);
    }
  };

  const focusAgent = state.timelineFocusAgentId
    ? state.agents.get(state.timelineFocusAgentId)
    : undefined;
  const entries = focusAgent
    ? state.timeline.filter((e) => {
        if (e.agent === focusAgent.name) return true;
        if (e.kind === "gate" || e.kind === "gate_ok") return true;
        if (focusAgent.group !== "development") return false;
        if (e.kind === "test") return true;
        return e.kind === "artifact" && e.tag === "DIFF";
      })
    : state.timeline;

  const blocks = buildStreamBlocks(entries);
  // Promote the last turn to running if an agent is active.
  const lastBlock = blocks.at(-1);
  if (lastBlock?.type === "turn") {
    const turn = lastBlock.turn;
    const active = [...state.agents.values()].find(
      (a) => a.status === "running" || a.status === "tool",
    );
    if (active && turn.primaryEntries.length === 0 && (turn.threadId === "main" || turn.threadId === active.id)) {
      turn.status = "running";
    }
  }

  return (
    <div className="text-xs px-2 py-1">
      {focusAgent && (
        <div className="my-1">
          <button
            onClick={() => {
              state.timelineFocusAgentId = undefined;
            }}
            className="text-term-dim hover:text-term-cyan"
          >
            信息流 › <span className="text-term-cyan">{focusAgent.name}</span>（点击返回）
          </button>
        </div>
      )}

      {blocks.map((block, i) => (
        <Block key={i} block={block} state={state} onToggleTurn={toggleTurn} />
      ))}

      <LiveDraftBlock state={state} />

      {!focusAgent && <GateBox state={state} actions={actions} />}
      {!focusAgent && <QuestionBox state={state} actions={actions} />}

      <LaunchButton state={state} actions={actions} />
      <TodoPanel state={state} />
      <LiveLine state={state} />
    </div>
  );
}
