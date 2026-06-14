"use client";

import { AGENT_CATALOG, GROUP_LABEL, type AgentGroup } from "../../../lib/catalog/agents";
import { agentWorkMs } from "../../../store/reducer";
import type { AgentStatus, AgentView, ConsoleState } from "../../../store/types";
import { Rule } from "../../ui/primitives";

function agentGlyph(status: AgentStatus): string {
  switch (status) {
    case "running":
      return "◉";
    case "tool":
      return "⚙";
    case "blocked":
      return "⛔";
    case "done":
      return "●";
    case "failed":
      return "✗";
    case "waiting":
      return "○";
    default:
      return "·";
  }
}

function agentGlyphColor(status: AgentStatus): string {
  switch (status) {
    case "running":
      return "text-term-cyan";
    case "tool":
      return "text-term-magenta";
    case "blocked":
      return "text-term-yellow";
    case "done":
      return "text-term-green";
    case "failed":
      return "text-term-red";
    case "waiting":
      return "text-term-dim";
    default:
      return "text-term-dim";
  }
}

function statusWord(agent: AgentView): string {
  switch (agent.status) {
    case "running":
    case "tool": {
      const sec = agent.activeSinceMs ? Math.floor((Date.now() - agent.activeSinceMs) / 1000) : 0;
      return `${agent.status === "tool" ? "tool" : "run"} ${sec}s`;
    }
    case "blocked":
      return "gate";
    case "done":
      return "done";
    case "failed":
      return "fail";
    case "waiting":
      return "wait";
    default:
      return "idle";
  }
}

function RosterRow({
  agent,
  selected,
  focused,
  pinned,
  onClick,
}: {
  agent: AgentView;
  selected: boolean;
  focused: boolean;
  pinned: boolean;
  onClick: () => void;
}) {
  const marker = focused ? "◆" : selected ? "▸" : pinned ? "·" : " ";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-1 px-1 py-0.5 text-xs ${
        selected ? "bg-term-cyan/10" : ""
      } hover:bg-term-cyan/5`}
    >
      <span className="text-term-cyan w-3 shrink-0">{marker}</span>
      <span className={`${agentGlyphColor(agent.status)} w-3 shrink-0`}>{agentGlyph(agent.status)}</span>
      <span className={`flex-1 truncate ${selected ? "text-term-cyan font-bold" : ""}`}>
        {agent.name}
      </span>
      <span className={`${agentGlyphColor(agent.status)} text-xs shrink-0`}>
        {statusWord(agent)}
      </span>
    </button>
  );
}

function DetailCard({ agent }: { agent: AgentView }) {
  const workMs = agentWorkMs(agent);
  const workSec = Math.floor(workMs / 1000);
  const workStr = workSec >= 60 ? `${Math.floor(workSec / 60)}m${workSec % 60}s` : `${workSec}s`;
  const recentTools = agent.lastTool ? [agent.lastTool] : [];

  return (
    <div className="px-1 py-1 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <span className={`${agentGlyphColor(agent.status)}`}>{agentGlyph(agent.status)}</span>
        <span className="font-bold text-term-cyan">{agent.name}</span>
        <span className={`${agentGlyphColor(agent.status)}`}>{statusWord(agent)}</span>
      </div>
      <div className="text-term-dim">{agent.role}</div>

      <div className="text-term-fg">{agent.description}</div>

      {agent.capabilities.length > 0 && (
        <>
          <div className="text-term-dim">能力</div>
          {agent.capabilities.slice(0, 3).map((cap, i) => (
            <div key={i} className="text-term-dim">
              · {cap}
            </div>
          ))}
        </>
      )}

      <div className="text-term-dim">
        简报: 工时 {workStr} · 工具 {agent.toolRuns} 次 · 产物 {agent.artifactCount} · 步骤 {agent.steps}
        {agent.errors > 0 && <span className="text-term-red"> · 错误 {agent.errors}</span>}
      </div>

      {agent.paorLog.length > 0 && (
        <>
          <div className="text-term-dim">─ 历史 · {agent.paorLog.length} 条 ─</div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {agent.paorLog.slice(-10).map((entry, i) => {
              const phaseLabel: Record<string, string> = {
                plan: "计划",
                act: "执行",
                observe: "观察",
                reflect: "反思",
                progress: "进度",
              };
              return (
                <div key={i} className="text-term-dim">
                  <span className="text-term-cyan">{phaseLabel[entry.phase] ?? entry.phase}</span>{" "}
                  <span className="text-term-fg">{entry.text}</span>
                  <span className="text-term-dim"> {entry.at}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {recentTools.length > 0 && (
        <div className="text-term-dim">⚙ 最近: {recentTools.join(", ")}</div>
      )}
    </div>
  );
}

export function AgentsColumn({ state }: { state: ConsoleState }) {
  const selectAgent = (agent: AgentView) => {
    state.inspectorAgentId = agent.id;
    state.focus = "agents";
  };
  const focusAgentStream = (agent: AgentView) => {
    state.timelineFocusAgentId = agent.id;
    state.focus = "timeline";
  };

  const groups: AgentGroup[] = ["requirement", "development"];
  const inspectId = state.inspectorAgentId ?? state.timelineFocusAgentId ?? state.lastAgentId;
  const inspectAgent = inspectId ? state.agents.get(inspectId) : undefined;
  const roster = [...AGENT_CATALOG].map((entry) => state.agents.get(entry.id)!).filter(Boolean);

  return (
    <div className="text-xs">
      <div className="px-2 py-1 font-bold text-term-cyan border-b border-term-dim/30">AGENTS</div>
      {groups.map((group) => (
        <div key={group}>
          <Rule label={GROUP_LABEL[group]} />
          {roster
            .filter((agent) => agent.group === group)
            .map((agent) => {
              const isSelected = state.inspectorAgentId === agent.id;
              const isFocused = state.timelineFocusAgentId === agent.id;
              const isPinned = state.lastAgentId === agent.id;
              return (
                <RosterRow
                  key={agent.id}
                  agent={agent}
                  selected={isSelected}
                  focused={isFocused}
                  pinned={isPinned}
                  onClick={() => selectAgent(agent)}
                />
              );
            })}
        </div>
      ))}

      {inspectAgent && (
        <>
          <Rule label="DETAIL" />
          <DetailCard agent={inspectAgent} />
          <div className="px-1 py-1">
            <button
              onClick={() => focusAgentStream(inspectAgent)}
              className="text-term-cyan hover:underline"
            >
              查看工作过程 →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
