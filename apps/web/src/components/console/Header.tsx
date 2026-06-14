"use client";

import { useEffect, useState } from "react";
import type { ConsoleState } from "../../store/types";
import type { ConsoleActions } from "../../hooks/useConsoleState";
import { StatusBadge, Spinner } from "../ui/primitives";
import { Stepper } from "./lifecycle/Stepper";

function elapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function Header({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  // Re-render every second for the elapsed timer.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const snapshot = state.snapshot;
  const project = snapshot?.project;
  const busy = state.busy.size > 0;
  const live = state.sseConnected;

  return (
    <header className="border-b border-term-dim/30 px-4 py-2 shrink-0">
      <div className="flex items-baseline gap-3">
        <span className="text-term-cyan text-lg font-bold">⬢ OneCompany</span>
        <span className="text-term-dim">·</span>
        <span className="font-bold truncate">{project?.name ?? "…"}</span>
      </div>
      <div className="flex items-center justify-between mt-1 text-xs">
        <div className="flex items-center gap-3">
          {project && <StatusBadge status={project.status} />}
          {busy && (
            <span className="text-term-cyan flex items-center gap-1">
              <Spinner /> working…
            </span>
          )}
          {state.yoloMode && <span className="text-term-yellow">⚡YOLO</span>}
          <span className="text-term-dim">
            {state.theme === "dark" ? "🌙" : "☀"} {state.theme}
          </span>
          <span className="text-term-dim">{elapsed(Date.now() - state.startedAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => actions.toggleTheme()}
            className="text-term-dim hover:text-term-cyan"
            title="toggle theme (m)"
          >
            theme
          </button>
          <button
            onClick={() => actions.toggleYolo()}
            className="text-term-dim hover:text-term-cyan"
            title="toggle YOLO (y)"
          >
            yolo
          </button>
          {live ? (
            <span className="text-term-green">● live</span>
          ) : (
            <span className="text-term-red">○ offline</span>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <Stepper status={project?.status ?? "Draft Requirement"} />
        {snapshot?.phase.progressLabel && (
          <span className="text-xs text-term-dim shrink-0">{snapshot.phase.progressLabel}</span>
        )}
      </div>
    </header>
  );
}
