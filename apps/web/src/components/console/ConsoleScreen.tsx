"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConsoleState } from "../../hooks/useConsoleState";
import { Header } from "./Header";
import { AgentsColumn } from "./agents/AgentsColumn";
import { StreamColumn } from "./stream/StreamColumn";
import { Composer } from "./composer/Composer";
import { InspectorColumn } from "./inspector/InspectorColumn";
import { CommandPalette } from "./overlays/CommandPalette";
import { FileViewer } from "./overlays/FileViewer";

const FOCUS_CYCLE = ["composer", "timeline", "agents"] as const;

/**
 * Three-column console: agents (left) · stream + composer (center) · inspector (right),
 * with a header lifecycle bar on top, hints on the bottom, and overlays (command
 * palette / file viewer) on top of everything. Mirrors renderConsole's grid.
 */
export function ConsoleScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { state, actions } = useConsoleState(projectId);

  const togglePalette = useCallback(() => {
    state.commandPalette = state.commandPalette
      ? undefined
      : { query: "", cursor: 0 };
  }, [state]);

  const closeViewer = useCallback(() => {
    state.viewer = undefined;
  }, [state]);

  // Global keyboard handling (mirrors handleConsoleKey).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inEditable = tag === "INPUT" || tag === "TEXTAREA";

      // Command palette open — route keys to it.
      if (state.commandPalette) {
        if (e.key === "Escape") {
          state.commandPalette = undefined;
        }
        return; // palette handles its own typing via its own input
      }
      // File viewer open — Esc closes.
      if (state.viewer) {
        if (e.key === "Escape") closeViewer();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "b") {
          e.preventDefault();
          router.push("/");
          return;
        }
        if (e.key === "r") {
          e.preventDefault();
          void actions.refresh();
          return;
        }
      }

      // Tab cycles focus.
      if (e.key === "Tab" && !inEditable) {
        e.preventDefault();
        const idx = FOCUS_CYCLE.indexOf(state.focus);
        state.focus = FOCUS_CYCLE[(idx + 1) % FOCUS_CYCLE.length]!;
        return;
      }

      // Single-letter shortcuts (only when not typing in the composer).
      if (!inEditable && state.focus !== "composer") {
        if (e.key === "m") {
          e.preventDefault();
          actions.toggleTheme();
        } else if (e.key === "y") {
          e.preventDefault();
          actions.toggleYolo();
        } else if (e.key === "b") {
          e.preventDefault();
          router.push("/");
        } else if (e.key === "d" && state.snapshot?.project.status === "PRD Ready") {
          e.preventDefault();
          void actions.dispatchAction("start_dev");
        } else if (e.key === "t" && state.snapshot?.project.status === "Testing") {
          e.preventDefault();
          void actions.dispatchAction("start_testing");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, router, actions, togglePalette, closeViewer]);

  const notice = state.notice;
  const noticeActive = notice && Date.now() - notice.at < 6_000;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header state={state} actions={actions} />

      <div className="flex-1 flex min-h-0">
        {/* Left: agents */}
        <div className="w-[20%] min-w-[200px] max-w-[280px] border-r border-term-dim/30 overflow-y-auto">
          <AgentsColumn state={state} />
        </div>

        {/* Center: stream + composer */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-term-dim/30">
          <div className="flex-1 overflow-y-auto">
            <StreamColumn state={state} actions={actions} />
          </div>
          <Composer state={state} actions={actions} />
        </div>

        {/* Right: inspector */}
        <div className="w-[24%] min-w-[240px] max-w-[340px] overflow-y-auto">
          <InspectorColumn state={state} actions={actions} />
        </div>
      </div>

      {/* Hints bar */}
      <div className="px-3 py-1 border-t border-term-dim/30 text-xs text-term-dim flex items-center gap-3 h-6">
        {noticeActive ? (
          <span className={notice!.kind === "error" ? "text-term-red" : "text-term-green"}>
            {notice!.kind === "error" ? "✗" : "✓"} {notice!.text}
          </span>
        ) : (
          <>
            <span>
              <kbd className="text-term-cyan">Ctrl+P</kbd> 命令
            </span>
            <span>
              <kbd className="text-term-cyan">Tab</kbd> focus
            </span>
            <span>
              <kbd className="text-term-cyan">^B</kbd> projects
            </span>
            <span>
              <kbd className="text-term-cyan">m</kbd> theme
            </span>
            <span>
              <kbd className="text-term-cyan">y</kbd> yolo
            </span>
          </>
        )}
      </div>

      {/* Overlays */}
      {state.commandPalette && <CommandPalette state={state} actions={actions} />}
      {state.viewer && <FileViewer state={state} onClose={closeViewer} />}
    </div>
  );
}
